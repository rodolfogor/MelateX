// Archivo: /api/sync-trigger.js
// Esta función corre en el servidor de Vercel (NUNCA en el navegador del usuario).
// El token de GitHub se lee de una variable de entorno secreta, así que
// nunca queda visible en el código público del sitio.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Falta configurar GH_DISPATCH_TOKEN en Vercel' });
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/rodolfogor/MelateX/actions/workflows/update_data.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
