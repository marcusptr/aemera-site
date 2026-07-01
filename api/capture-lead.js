// api/capture-lead.js — Capture un email dans Supabase (table leads_quizz), sans envoi de mail.
// Utilisé par le quiz "Premiers pas".
import { supabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { email } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    // Upsert : si l'email existe déjà, on ne duplique pas.
    const { error } = await supabaseAdmin
      .from('leads_quizz')
      .upsert({ email }, { onConflict: 'email' });

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erreur capture-lead:', err);
    // On ne bloque jamais l'utilisateur pour un échec de capture — le téléchargement
    // côté site doit fonctionner même si l'écriture en base échoue.
    return res.status(200).json({ success: false });
  }
}
