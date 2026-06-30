// api/send-report.js — Envoie le rapport généré par email au client, via Resend

import { supabaseAdmin } from '../lib/supabase.js';

const NOMS_PRODUITS = {
  symptome: 'Analyse de Symptôme',
  bilan: 'Bilan Bien-Être Global',
  ebook: 'Ebook Santé IA',
  'prise-de-sang': 'Analyse de Prise de Sang',
};

// Envoie l'email via Resend. Exportée pour être appelée directement par le webhook Stripe.
//
// ⚠️ THOMAS : l'adresse d'envoi ci-dessous (onboarding@resend.dev) est l'adresse de
// test par défaut de Resend — elle fonctionne tout de suite, sans configuration.
// Pour envoyer depuis une adresse @aemera.life, il faudra vérifier le domaine
// dans Resend (Domains → Add Domain) puis remplacer l'adresse ci-dessous.
export async function sendReportEmail({ email, produit, contenu }) {
  const nomProduit = NOMS_PRODUITS[produit] || produit;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'AEMERA <onboarding@resend.dev>',
      to: email,
      subject: `Votre rapport AEMERA — ${nomProduit}`,
      text: contenu,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur Resend (${response.status}): ${errText}`);
  }

  return response.json();
}

// Route HTTP — utile pour renvoyer manuellement un rapport déjà généré
// (ex: email parti en erreur, on relance juste l'envoi).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { commande_id } = req.body || {};
    if (!commande_id) {
      return res.status(400).json({ error: 'commande_id manquant' });
    }

    const { data: commande, error: cmdErr } = await supabaseAdmin
      .from('commandes')
      .select('*, clients(email)')
      .eq('id', commande_id)
      .single();

    if (cmdErr || !commande || !commande.clients?.email) {
      return res.status(404).json({ error: 'Commande ou email client introuvable' });
    }

    const { data: rapport, error: repErr } = await supabaseAdmin
      .from('rapports')
      .select('*')
      .eq('commande_id', commande_id)
      .order('id', { ascending: false })
      .limit(1)
      .single();

    if (repErr || !rapport) {
      return res.status(404).json({ error: 'Rapport introuvable pour cette commande' });
    }

    await sendReportEmail({
      email: commande.clients.email,
      produit: commande.produit,
      contenu: rapport.contenu,
    });

    await supabaseAdmin
      .from('rapports')
      .update({ envoye_le: new Date().toISOString() })
      .eq('id', rapport.id);

    await supabaseAdmin
      .from('commandes')
      .update({ statut: 'envoye' })
      .eq('id', commande_id);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Send-report error:', err);
    return res.status(500).json({ error: "Erreur envoi du rapport" });
  }
}
