const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');

// Configuración del Manifiesto compatible con Stremio
const manifest = {
    id: 'org.okru.latino',
    version: '1.0.0',
    name: 'OK.ru Latino Addon',
    description: 'Busca videos en OK.ru con audio Latino y duración mayor a 40 minutos.',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Lógica de búsqueda y filtrado en OK.ru
async function searchOkRuStreams(query) {
    try {
        const searchQuery = encodeURIComponent(`${query} Latino`);
        const url = `https://ok.ru/dk?cmd=logExternal&st.cmd=extSearch&st.search=${searchQuery}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const html = await response.text();
        
        // Simulación de parseo de resultados y aplicación estricta de filtros:
        // 1. Duración > 40 minutos (2400 segundos)
        // 2. Título contiene "Latino"
        const mockStreams = [
            // Ejemplo de estructura de prueba que cumple la condición
        ];

        return mockStreams.filter(stream => {
            const isValidDuration = stream.duration && stream.duration > 2400;
            const hasLatinoTitle = stream.title && stream.title.toLowerCase().includes('latino');
            return isValidDuration && hasLatinoTitle;
        });
    } catch (error) {
        console.error('Error al buscar en OK.ru:', error);
        return [];
    }
}

// Manejador de Streams para Stremio
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`Petición recibida en Stremio - Tipo: ${type}, ID: ${id}`);
    
    // Aquí puedes resolver el ID de TMDB/IMDB a un título de búsqueda
    const streams = await searchOkRuStreams("consulta");

    return {
        streams: streams.map(s => ({
            title: s.title,
            url: s.url,
            name: 'OK.ru Latino'
        }))
    };
});

// Configuración de Servidor Express (Compatible con Vercel y adaptado para Nuvio/Stremio)
const app = express();
app.use(cors());

// Exportar manifiesto para Nuvio o peticiones directas
app.get('/manifest.json', (type, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
});

// Integración del addon SDK con Express
const addonInterface = builder.getInterface();
app.use((req, res, next) => {
    // Si la ruta coincide con el formato de Stremio, la maneja el SDK
    addonInterface.middleware(req, res, next);
});

// Puerto local para pruebas (Vercel maneja su propio puerto mediante Serverless)
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Addon corriendo en http://localhost:${PORT}`);
});

module.exports = app;