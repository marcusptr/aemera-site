// api/get-content.js
// Récupère le contenu actuel du site depuis GitHub
// pour que le panneau admin puisse l'afficher et le modifier.

export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = 'marcusptr/aemera-site';
  const FILE_PATH = 'index.html';
  const BRANCH = 'main';

  try {
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
      return res.status(500).json({ error: 'Impossible de lire le fichier', details: err });
    }

    const fileData = await getFileRes.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

    return res.status(200).json({ content });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
}
