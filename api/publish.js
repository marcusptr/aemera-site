// api/publish.js
// Cette fonction tourne sur Vercel (qui a accès à internet).
// Elle reçoit le nouveau contenu HTML et le pousse sur GitHub.
// Le token GitHub est lu depuis les variables d'environnement Vercel (jamais dans le code).

export default async function handler(req, res) {
  // On n'accepte que les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  // Vérification du mot de passe admin (pour que toi seul puisses publier)
  const { password, content } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  if (!content) {
    return res.status(400).json({ error: 'Aucun contenu fourni' });
  }

  // Configuration GitHub
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = 'marcusptr/aemera-site';
  const FILE_PATH = 'index.html';
  const BRANCH = 'main';

  try {
    // 1. Récupérer le SHA du fichier actuel (obligatoire pour le modifier)
    const getFileRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
      {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'aemera-admin'
        }
      }
    );

    if (!getFileRes.ok) {
      const err = await getFileRes.text();
      return res.status(500).json({ error: 'Impossible de lire le fichier sur GitHub', details: err });
    }

    const fileData = await getFileRes.json();
    const currentSha = fileData.sha;

    // 2. Encoder le nouveau contenu en base64 (format requis par GitHub)
    const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

    // 3. Pousser le nouveau contenu
    const updateRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'aemera-admin',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Mise à jour du site via panneau admin - ${new Date().toLocaleString('fr-FR')}`,
          content: encodedContent,
          sha: currentSha,
          branch: BRANCH
        })
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      return res.status(500).json({ error: 'Impossible de publier sur GitHub', details: err });
    }

    // Succès ! Vercel va automatiquement redéployer le site.
    return res.status(200).json({ success: true, message: 'Site publié ! Il sera en ligne dans 1-2 minutes.' });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
