const CACHE_NAME = 'atlas-cache-v1';
const GEOJSON_CACHE = 'geojson-cache';

// Files to cache aggressively
const CACHE_URLS = [
  '/data/countries-10m.json',
  '/data/external-countries.geojson', 
  '/data/world-atlas/countries-dissolved-land.geojson',
  '/data/world-atlas/countries-10m.json',
  '/data/empires/roman_empire_117ad_major_empires_source.geojson',
  '/data/empires/mongol_empire_1279_extent.medium.geojson',
  '/data/empires/british_empire_1921_extent.low.geojson',
  '/data/world-atlas/land-50m.geojson',
  '/data/world-atlas/osm-coastlines.smooth.geojson'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_URLS.map(url => new Request(url, {cache: 'force-cache'})));
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Cache GeoJSON files
  if (CACHE_URLS.some(cacheUrl => url.pathname.includes(cacheUrl))) {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          return response;
        }
        
        return fetch(request).then(fetchResponse => {
          // Cache successful responses
          if (fetchResponse.ok) {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(request, fetchResponse.clone());
            });
          }
          return fetchResponse;
        });
      })
    );
  }
  
  return fetch(request);
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete(CACHE_NAME));
});
