// api/checkout.js — Vercel Serverless Function
// Crée une session Stripe Checkout + enregistre une commande "en_attente" dans Supabase.
// La clé secrète Stripe et la clé service_role Supabase sont lues depuis les
// Environment Variables de Vercel — JAMAIS dans le code client.

import Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Catalogue produits VERROUILLÉ côté serveur.
// On NE fait jamais confiance au prix envoyé par le client : le prix est défini ici.
// Montants en centimes d'euro (pour Stripe) — convertis en euros pour la base (prix_paye).
//
// "cle" = clé interne utilisée par le site (boutons data-buy="...")
// "produitDb" = valeur stockée en base, qui doit rester dans la liste verrouillée côté SQL
//               (symptome / bilan / ebook / prise-de-sang) — "sang" est traduit en "prise-de-sang".
const PRODUITS = {
  symptome: {
    nom: 'Analyse de Symptôme',
    description: 'Analyse personnalisée ciblée sur un symptôme précis, livrée par mail.',
    montant: 1900, // 19,00 €
    produitDb: 'symptome',
  },
  bilan: {
    nom: 'Bilan Bien-Être Global',
    description: 'Analyse complète de vos habitudes : points forts, axes d\u2019amélioration, protocoles.',
    montant: 1400, // 14,00 €
    produitDb: 'bilan',
  },
  ebook: {
    nom: 'Ebook « Santé IA 2026 »',
    description: 'Apprenez à faire vos propres analyses de santé grâce à l\u2019IA.',
    montant: 3400, // 34,00 €
    produitDb: 'ebook',
  },
  sang: {
    nom: 'Analyse de Prise de Sang',
    description: 'Chaque marqueur de votre prise de sang expliqué en langage clair, livré par mail.',
    montant: 1900, // 19,00 €
    produitDb: 'prise-de-sang',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { produit } = req.body || {};
    const item = PRODUITS[produit];

    if (!item) {
      return res.status(400).json({ error: 'Produit inconnu' });
    }

    // 1. On enregistre la commande en base AVANT de créer la session Stripe,
    //    pour avoir un id à mettre dans les métadonnées (le webhook s'en sert
    //    pour retrouver la commande une fois le paiement confirmé).
    const { data: commande, error: dbErr } = await supabaseAdmin
      .from('commandes')
      .insert({
        produit: item.produitDb,
        prix_paye: item.montant / 100,
        statut: 'en_attente',
      })
      .select()
      .single();

    if (dbErr) {
      console.error('Erreur insertion commande:', dbErr);
      return res.status(500).json({ error: 'Erreur lors de la préparation de la commande' });
    }

    // Origine du site, pour les URLs de retour (marche en local, preview et prod)
    const origin =
      req.headers.origin ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://aemera.life');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.nom,
              description: item.description,
            },
            unit_amount: item.montant,
          },
          quantity: 1,
        },
      ],
      // Page de retour : la SPA lit ?success=1 / ?canceled=1
      success_url: `${origin}/?success=1&produit=${encodeURIComponent(produit)}`,
      cancel_url: `${origin}/?canceled=1&produit=${encodeURIComponent(produit)}`,
      // Collecte l'email pour l'envoi du rapport (cohérent avec le workflow mail)
      customer_creation: 'if_required',
      billing_address_collection: 'auto',
      locale: 'fr',
      // Le webhook stripe-webhook.js relit cet id pour retrouver la commande Supabase
      metadata: { commande_id: commande.id, produit: item.produitDb },
    });

    // On garde une trace de l'id de session Stripe pour debug / idempotence.
    await supabaseAdmin
      .from('commandes')
      .update({ stripe_session_id: session.id })
      .eq('id', commande.id);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement' });
  }
}    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { produit } = req.body || {};
    const item = PRODUITS[produit];

    if (!item) {
      return res.status(400).json({ error: 'Produit inconnu' });
    }

    // Origine du site, pour les URLs de retour (marche en local, preview et prod)
    const origin =
      req.headers.origin ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://aemera.life');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.nom,
              description: item.description,
            },
            unit_amount: item.montant,
          },
          quantity: 1,
        },
      ],
      // Page de retour : la SPA lit ?success=1 / ?canceled=1
      success_url: `${origin}/?success=1&produit=${encodeURIComponent(produit)}`,
      cancel_url: `${origin}/?canceled=1&produit=${encodeURIComponent(produit)}`,
      // Collecte l'email pour l'envoi du rapport (cohérent avec le workflow mail)
      customer_creation: 'if_required',
      billing_address_collection: 'auto',
      locale: 'fr',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement' });
  }
}
