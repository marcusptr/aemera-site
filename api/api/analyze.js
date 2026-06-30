// api/analyze.js — Génère le contenu du rapport santé via l'API Claude (Anthropic)

// ════════════════════════════════════════════════════════════════════════
// 👉 THOMAS : POUR CHANGER LE PROMPT, MODIFIE UNIQUEMENT LE TEXTE CI-DESSOUS
//    entre les ` ` (backticks). Ne touche à rien d'autre dans ce fichier.
//    {produit} sera automatiquement remplacé par le produit acheté
//    (symptome / bilan / ebook / prise-de-sang).
// ════════════════════════════════════════════════════════════════════════
const REPORT_PROMPT = `Génère un texte de test de 3 phrases confirmant que le système fonctionne, en mentionnant le produit acheté : {produit}.`;
// ════════════════════════════════════════════════════════════════════════
// FIN DE LA ZONE MODIFIABLE — ne pas toucher en dessous de cette ligne.
// ════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../lib/supabase.js';

const NOMS_PRODUITS = {
  symptome: 'Analyse de Symptôme',
  bilan: 'Bilan Bien-Être Global',
  ebook: 'Ebook Santé IA',
  'prise-de-sang': 'Analyse de Prise de Sang',
};

// Appelle l'API Claude et renvoie le texte généré pour une commande donnée.
// Exportée pour être appelée directement par le webhook Stripe (pas de double appel HTTP).
export async function generateReport(commande) {
  const prompt = REPORT_PROMPT.replace(
    '{produit}',
    NOMS_PRODUITS[commande.produit] || commande.produit
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur API Claude (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Réponse Claude sans bloc texte');
  return textBlock.text;
}

// Route HTTP — utile pour tester manuellement la génération sur une commande
// existante sans repasser par tout le tunnel de paiement.
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
      .select('*')
      .eq('id', commande_id)
      .single();

    if (cmdErr || !commande) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    const contenu = await generateReport(commande);

    const { data: rapport, error: insErr } = await supabaseAdmin
      .from('rapports')
      .insert({ commande_id, contenu })
      .select()
      .single();

    if (insErr) throw insErr;

    await supabaseAdmin
      .from('commandes')
      .update({ statut: 'rapport_genere' })
      .eq('id', commande_id);

    return res.status(200).json({ rapport });
  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: 'Erreur génération du rapport' });
  }
}
