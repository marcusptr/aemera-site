// api/stripe-webhook.js — Reçoit la confirmation de paiement Stripe et orchestre la suite :
// commande payée → génération du rapport (Claude) → envoi par email (Resend).
//
// Pour activer : dans Stripe Dashboard → Developers → Webhooks → Add endpoint
//   URL : https://<ton-domaine>/api/stripe-webhook
//   Événement à écouter : checkout.session.completed
//   Copier le "Signing secret" (whsec_...) dans Vercel → STRIPE_WEBHOOK_SECRET

import Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';
import { generateReport } from './analyze.js';
import { sendReportEmail } from './send-report.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe a besoin du corps brut (non parsé) de la requête pour vérifier la signature.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const signature = req.headers['stripe-signature'];
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Signature webhook invalide:', err.message);
    return res.status(400).send(`Webhook signature verification failed`);
  }

  if (event.type !== 'checkout.session.completed') {
    // On ne traite que les paiements confirmés ; tout le reste est ignoré sans erreur.
    return res.status(200).json({ received: true, ignored: event.type });
  }

  try {
    const session = event.data.object;
    const commande_id = session.metadata?.commande_id;
    const email = session.customer_details?.email;

    if (!commande_id || !email) {
      console.error('Webhook checkout.session.completed sans commande_id ou email', { commande_id, email });
      return res.status(200).json({ received: true, skipped: 'metadata manquante' });
    }

    // Idempotence : si Stripe renvoie deux fois le même événement (ça arrive),
    // on ne traite la commande qu'une seule fois.
    const { data: commande, error: cmdErr } = await supabaseAdmin
      .from('commandes')
      .select('*')
      .eq('id', commande_id)
      .single();

    if (cmdErr || !commande) {
      console.error('Commande introuvable pour webhook:', commande_id);
      return res.status(200).json({ received: true, skipped: 'commande introuvable' });
    }
    if (commande.statut !== 'en_attente') {
      return res.status(200).json({ received: true, skipped: 'déjà traitée' });
    }

    // 1. Client : on récupère ou on crée
    let { data: client } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('email', email)
      .single();

    if (!client) {
      const { data: newClient, error: clientErr } = await supabaseAdmin
        .from('clients')
        .insert({ email })
        .select()
        .single();
      if (clientErr) throw clientErr;
      client = newClient;
    }

    // 2. Commande → payée
    await supabaseAdmin
      .from('commandes')
      .update({ client_id: client.id, statut: 'paye' })
      .eq('id', commande_id);

    // 3. Génération du rapport (Claude, prompt placeholder pour l'instant)
    const contenu = await generateReport({ ...commande, client_id: client.id });

    const { data: rapport, error: rapErr } = await supabaseAdmin
      .from('rapports')
      .insert({ commande_id, contenu })
      .select()
      .single();
    if (rapErr) throw rapErr;

    await supabaseAdmin
      .from('commandes')
      .update({ statut: 'rapport_genere' })
      .eq('id', commande_id);

    // 4. Envoi email (Resend)
    await sendReportEmail({ email, produit: commande.produit, contenu });

    await supabaseAdmin
      .from('rapports')
      .update({ envoye_le: new Date().toISOString() })
      .eq('id', rapport.id);

    await supabaseAdmin
      .from('commandes')
      .update({ statut: 'envoye' })
      .eq('id', commande_id);

    return res.status(200).json({ received: true, commande_id, statut: 'envoye' });
  } catch (err) {
    // On loggue l'erreur mais on répond quand même 200 à Stripe pour éviter
    // qu'il ne spamme de retries sur une erreur de notre côté (ex: clé Resend manquante).
    // L'erreur reste visible dans les logs Vercel pour debug.
    console.error('Erreur traitement webhook:', err);
    return res.status(200).json({ received: true, error: 'Erreur interne, voir logs Vercel' });
  }
}
