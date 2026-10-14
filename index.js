const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');

// Configuración del Manifiesto con Soporte de Catálogo y Streams
const manifest = {
    id: 'org.okru.latino',
    version: '1.1.0',
    name: 'OK.ru Latino Addon',
    description: 'Busca videos en OK.ru con audio Latino y duración mayor a 40 minutos.',
    resources: ['catalog', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'okru_latino_movies',
            name: 'OK.ru Latino (Películas)'
        }
    ],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Manejador de Catálogo (Muestra elementos en la pantalla de inicio de Stremio)
builder.defineCatalogHandler(async ({ type, id }) => {
    console.log(`[Stremio Catalog] Petición para tipo: ${type}, id: ${id}`);
    
    // Aquí puedes listar elementos estáticos o de prueba que cumplan con la condición para verlos en la UI principal
    const metas = [
        {
            id: 'tt1234567', // ID de prueba (puedes cambiarlo por IDs reales de IMDb)
            type: 'movie',
            name: 'Película de Prueba Latino (OK.ru)',
            poster: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=500',
            description: 'Video de prueba alojado en OK.ru con audio Latino y más de 40 minutos de duración.'
        }
    ];

    return { metas };
});

// Manejador de Streams (Se ejecuta al hacer clic en una película/serie)
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`[Stremio Stream] Petición recibida - Tipo: ${type}, ID: ${id}`);
    
    // Simulación de streams reales filtrados por duración (>40 min) y palabra "Latino"
    // En producción, aquí harías scraping o consulta a la API de OK.ru
    const streams = [
        {
            title: 'Opción 1 - Audio Latino (HD - 1h 45m)',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', // URL de prueba reproducible
            name: 'OK.ru Latino'
        }
    ];

    // Filtro estricto de seguridad para asegurar que cumple los requisitos
    const validStreams = streams.filter(s => s.title.toLowerCase().includes('latino'));

    return { streams: validStreams };
});

// Configuración de Servidor Express
const app = express();
app.use(cors());

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
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