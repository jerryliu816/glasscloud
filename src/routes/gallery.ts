import { Router, type Request, type Response } from 'express';
import { sessions } from '../server/sessions.js';
import { listImages } from '../services/image.service.js';

export const galleryRouter = Router();

const PAGE_SIZE = 20;

/**
 * GET /console/gallery — Full-page gallery with date filter, pagination, lightbox
 */
galleryRouter.get('/', (req: Request, res: Response) => {
  const sessionId = req.query['session'] as string;
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session) {
    res.status(401).send('<h1>401 Unauthorized</h1><p><a href="/console">Sign in</a></p>');
    return;
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Gallery — GlassCloud</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { background: #1a73e8; color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    header h1 { font-size: 24px; }
    header a { color: white; opacity: 0.9; text-decoration: none; font-size: 14px; }
    header a:hover { opacity: 1; text-decoration: underline; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .btn { display: inline-block; padding: 8px 16px; background: #1a73e8; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #1557b0; }
    .btn-secondary { background: #6c757d; }
    .btn-secondary:hover { background: #545b62; }
    .filter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
    .filter-row label { font-size: 14px; font-weight: 500; color: #333; }
    .filter-row input[type="datetime-local"] { padding: 7px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    #gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 16px; }
    .img-card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; cursor: pointer; transition: box-shadow 0.15s; }
    .img-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .img-card img { width: 100%; height: 160px; object-fit: cover; display: block; }
    .img-card-body { padding: 10px; }
    .img-card-desc { font-size: 13px; color: #333; font-weight: 500; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .img-card-meta { font-size: 11px; color: #888; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 20px; }
    .pagination span { font-size: 14px; color: #555; }
    #gallery-status { color: #666; font-size: 14px; padding: 20px 0; text-align: center; }
    /* Lightbox */
    #lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; align-items: center; justify-content: center; }
    #lightbox.open { display: flex; }
    #lightbox img { max-width: 92vw; max-height: 92vh; object-fit: contain; border-radius: 4px; }
    #lightbox-close { position: absolute; top: 16px; right: 20px; color: white; font-size: 32px; cursor: pointer; line-height: 1; background: none; border: none; opacity: 0.8; }
    #lightbox-close:hover { opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Image Gallery</h1>
        <div style="opacity:0.85;font-size:13px;margin-top:3px;">${session.email}</div>
      </div>
      <a href="/console?session=${sessionId}">← Back to Console</a>
    </header>

    <div class="card">
      <div class="filter-row">
        <label for="from-dt">From:</label>
        <input type="datetime-local" id="from-dt">
        <label for="to-dt">To:</label>
        <input type="datetime-local" id="to-dt">
        <button class="btn" onclick="applyFilter()">Apply</button>
        <button class="btn btn-secondary" onclick="clearFilter()">Clear</button>
      </div>
    </div>

    <div id="gallery-status">Loading…</div>
    <div id="gallery-grid"></div>
    <div class="pagination" id="pagination" style="display:none">
      <button class="btn btn-secondary" id="btn-prev" onclick="changePage(-1)">← Previous</button>
      <span id="page-info"></span>
      <button class="btn" id="btn-next" onclick="changePage(1)">Next →</button>
    </div>
  </div>

  <!-- Lightbox -->
  <div id="lightbox" onclick="closeLightbox()">
    <button id="lightbox-close" onclick="closeLightbox()">&#x2715;</button>
    <img id="lightbox-img" src="" alt="Full size image" onclick="event.stopPropagation()">
  </div>

  <script>
    var SESSION_ID = ${JSON.stringify(sessionId)};
    var PAGE_SIZE = ${PAGE_SIZE};
    var currentPage = 0;
    var currentFrom = '';
    var currentTo = '';

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    function formatDate(ms) {
      if (!ms) return '';
      return new Date(ms).toLocaleString();
    }

    function loadGallery() {
      var url = '/console/gallery/api/images?session=' + encodeURIComponent(SESSION_ID)
        + '&page=' + currentPage
        + (currentFrom ? '&from=' + encodeURIComponent(currentFrom) : '')
        + (currentTo ? '&to=' + encodeURIComponent(currentTo) : '');

      document.getElementById('gallery-status').textContent = 'Loading…';
      document.getElementById('gallery-grid').innerHTML = '';
      document.getElementById('pagination').style.display = 'none';

      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var status = document.getElementById('gallery-status');
          var grid = document.getElementById('gallery-grid');
          var pagination = document.getElementById('pagination');

          if (!data.images || data.images.length === 0) {
            status.textContent = 'No images found.';
            return;
          }

          status.textContent = '';
          grid.innerHTML = data.images.map(function(img) {
            var displayDate = img.capturedAt ? formatDate(img.capturedAt) : formatDate(img.receivedAt);
            return '<div class="img-card" onclick="openModal(\\'/images/originals/' + escapeHtml(img.originalFilename) + '\\')">' +
              '<img src="/images/thumbnails/' + escapeHtml(img.thumbnailFilename) + '" alt="' + escapeHtml(img.sceneDescription) + '" loading="lazy">' +
              '<div class="img-card-body">' +
                '<div class="img-card-desc" title="' + escapeHtml(img.sceneDescription) + '">' + escapeHtml(img.sceneDescription) + '</div>' +
                '<div class="img-card-meta">' + escapeHtml(displayDate) + '</div>' +
                '<div class="img-card-meta">' + escapeHtml(img.deviceModel) + ' &mdash; ' + escapeHtml(img.deviceInstanceId) + '</div>' +
              '</div>' +
            '</div>';
          }).join('');

          var totalPages = Math.ceil(data.total / PAGE_SIZE);
          if (totalPages > 1) {
            pagination.style.display = 'flex';
            document.getElementById('page-info').textContent = 'Page ' + (currentPage + 1) + ' of ' + totalPages + ' (' + data.total + ' images)';
            document.getElementById('btn-prev').disabled = currentPage === 0;
            document.getElementById('btn-next').disabled = currentPage >= totalPages - 1;
          }
        })
        .catch(function(err) {
          document.getElementById('gallery-status').textContent = 'Failed to load images: ' + err.message;
        });
    }

    function applyFilter() {
      currentPage = 0;
      currentFrom = document.getElementById('from-dt').value;
      currentTo = document.getElementById('to-dt').value;
      loadGallery();
    }

    function clearFilter() {
      currentPage = 0;
      currentFrom = '';
      currentTo = '';
      document.getElementById('from-dt').value = '';
      document.getElementById('to-dt').value = '';
      loadGallery();
    }

    function changePage(delta) {
      currentPage += delta;
      loadGallery();
    }

    function openModal(src) {
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox').classList.add('open');
    }

    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('open');
      document.getElementById('lightbox-img').src = '';
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });

    loadGallery();
  </script>
</body>
</html>`);
});

/**
 * GET /console/gallery/api/images — JSON list for gallery JS
 */
galleryRouter.get('/api/images', (req: Request, res: Response) => {
  const sessionId = req.query['session'] as string;
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const page = Math.max(0, parseInt((req.query['page'] as string) || '0', 10) || 0);
  const fromIso = req.query['from'] as string | undefined;
  const toIso = req.query['to'] as string | undefined;

  let fromMs: number | undefined;
  let toMs: number | undefined;

  if (fromIso) {
    const parsed = new Date(fromIso).getTime();
    if (!isNaN(parsed)) fromMs = parsed;
  }
  if (toIso) {
    const parsed = new Date(toIso).getTime();
    if (!isNaN(parsed)) toMs = parsed;
  }

  const { images, total } = listImages({
    fromMs,
    toMs,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  res.json({ images, total, page, pageSize: PAGE_SIZE });
});
