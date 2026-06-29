// api/checkout.js — Vercel Serverless Function
// Crée une session Stripe Checkout. La clé secrète (STRIPE_SECRET_KEY)
// est lue depuis les Environment Variables de Vercel — JAMAIS dans le code client.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Catalogue produits VERROUILLÉ côté serveur.
// On NE fait jamais confiance au prix envoyé par le client : le prix est défini ici.
// Montants en centimes d'euro.
const PRODUITS = {
  symptome: {
    nom: 'Analyse de Symptôme',
    description: 'Analyse personnalisée ciblée sur un symptôme précis, livrée par mail.',
    montant: 1900, // 19,00 €
  },
  bilan: {
    nom: 'Bilan Bien-Être Global',
    description: 'Analyse complète de vos habitudes : points forts, axes d\u2019amélioration, protocoles.',
    montant: 1400, // 14,00 €
  },
  ebook: {
    nom: 'Ebook « Santé IA 2026 »',
    description: 'Apprenez à faire vos propres analyses de santé grâce à l\u2019IA.',
    montant: 3400, // 34,00 €
  },
  sang: {
    nom: 'Analyse de Prise de Sang',
    description: 'Chaque marqueur de votre prise de sang expliqué en langage clair, livré par mail.',
    montant: 1900, // 19,00 €
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
