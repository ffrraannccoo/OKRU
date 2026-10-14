const { addonBuilder } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');

const manifest = {
    id: 'org.okru.latino',
    version: '1.4.0',
    name: 'OK.ru Latino Addon (Debug Mode)',
    description: 'Addon con herramientas de depuración para rastrear OMDb y OK.ru',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// 1. Depuración de OMDb / IMDb
async function getTitlesFromIMDb(imdbId) {
    try {
        console.log(`[DEBUG IMDb] Consultando OMDb para el ID: ${imdbId}`);
        const response = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=trilogy`);
        const data = await response.json();
        
        console.log(`[DEBUG IMDb] Respuesta cruda de OMDb:`, JSON.stringify(data));
        
        if (data && data.Response === "True") {
            const originalTitle = data.Title;
            const titles = [originalTitle];
            
            if (data.Title && data.Title !== originalTitle) {
                titles.push(data.Title);
            }
            
            const uniqueTitles = [...new Set(titles)];
            console.log(`[DEBUG IMDb] Títulos extraídos para búsqueda:`, uniqueTitles);
            return uniqueTitles;
        } else {
            console.log(`[DEBUG IMDb] OMDb no encontró el título para ${imdbId}. Motivo: ${data.Error || 'Desconocido'}`);
        }
    } catch (error) {
        console.error(`[DEBUG IMDb] Error en fetch a OMDb:`, error);
    }
    return [];
}

// 2. Depuración de Scraping en OK.ru
async function searchOkRu(query) {
    let validStreams = [];
    try {
        const searchQuery = encodeURIComponent(`${query} Latino`);
        const url = `https://ok.ru/dk?cmd=logExternal&st.cmd=extSearch&st.search=${searchQuery}`;
        console.log(`[DEBUG OK.ru] Realizando petición HTTP a: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'es-ES,es;q=0.9'
            }
        });
        
        const html = await response.text();
        console.log(`[DEBUG OK.ru] HTML recibido (longitud de caracteres): ${html.length}`);

        // Expresión regular para inspeccionar los videos encontrados en el HTML
        const videoRegex = /href="(\/video\/\d+)"[^>]*>([^<]+)<\/a>/g;
        let match;
        let count = 0;

        while ((match = videoRegex.exec(html)) !== null) {
            count++;
            const videoPath = match[1];
            const videoTitle = match[2].trim();
            const videoUrl = `https://ok.ru${videoPath}`;

            const hasLatino = videoTitle.toLowerCase().includes('latino');
            console.log(`[DEBUG OK.ru Encontrado #${count}] Título: "${videoTitle}" | Contiene "Latino": ${hasLatino}`);

            if (hasLatino) {
                validStreams.push({
                    title: `[OK.ru Latino] ${videoTitle}`,
                    url: videoUrl,
                    name: 'OK.ru Latino'
                });
            }
        }

        console.log(`[DEBUG OK.ru] Total de videos filtrados que pasaron el filtro "Latino" para "${query}": ${validStreams.length}`);

    } catch (error) {
        console.error(`[DEBUG OK.ru] Error haciendo scraping para "${query}":`, error);
    }
    
    return validStreams;
}

// Lógica principal de resolución compartida
async function processSearch(imdbId) {
    console.log(`--- INICIO DE PROCESAMIENTO PARA ID: ${imdbId} ---`);
    const searchTitles = await getTitlesFromIMDb(imdbId);
    
    if (searchTitles.length === 0) {
        searchTitles.push(imdbId);
    }

    let allStreams = [];
    for (const title of searchTitles) {
        const streamsFound = await searchOkRu(title);
        allStreams = allStreams.concat(streamsFound);
    }

    const uniqueStreams = Array.from(new Map(allStreams.map(s => [s.url, s])).values());
    console.log(`--- FIN PROCESAMIENTO. Streams totales devueltos: ${uniqueStreams.length} ---`);
    return uniqueStreams;
}

// Manejador de Streams de Stremio
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`[Stremio Stream Handler] Petición entrante - Tipo: ${type}, ID: ${id}`);
    const streams = await processSearch(id);
    return { streams };
});

const app = express();
app.use(cors());

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
});

// NUEVA RUTA DE DEBUG WEB: Permite probar la búsqueda escribiendo en el navegador
// Ejemplo: https://tu-vercel.vercel.app/debug?imdb=tt1330801
app.get('/debug', async (req, res) => {
    const imdbId = req.query.imdb || 'tt1330801';
    console.log(`[Web Debug] Solicitud manual iniciada para ID: ${imdbId}`);
    try {
        const titles = await getTitlesFromIMDb(imdbId);
        let results = [];
        for(const t of titles) {
            const found = await searchOkRu(t);
            results = results.push ? results.concat(found) : found;
        }
        res.json({
            imdbId,
            titlesExtracted: titles,
            streamsFound: results
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const addonInterface = builder.getInterface();
app.use((req, res, next) => {
    addonInterface.middleware(req, res, next);
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Addon corriendo en puerto ${PORT}`);
});

module.exports = app;