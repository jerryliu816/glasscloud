# Image Capture API

Glass devices can upload captured images to GlassCloud along with scene-analysis metadata. A web gallery is provided for browsing uploaded images.

---

## Architecture Overview

### Upload Flow
1. Glass device captures an image and sends a `multipart/form-data` POST to `/api/images/upload` with a JWT Bearer token.
2. The server validates the file type, writes the original to `./data/images/`, generates a 400×400 thumbnail in `./data/thumbnails/`, and inserts a row into `glass_images`.
3. The response includes the image ID and filenames for subsequent retrieval.

### Storage Paths
| Content | Directory |
|---|---|
| Original images | `./data/images/` |
| Thumbnails (max 400×400 JPEG) | `./data/thumbnails/` |

### DB Table
```sql
CREATE TABLE IF NOT EXISTS glass_images (
    id TEXT PRIMARY KEY,
    device_model TEXT NOT NULL,
    device_instance_id TEXT NOT NULL,
    scene_description TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    thumbnail_filename TEXT NOT NULL,
    captured_at INTEGER,      -- nullable Unix ms (device-supplied)
    received_at INTEGER NOT NULL, -- Unix ms (server-set)
    created_at INTEGER NOT NULL
);
```

---

## Authentication

All `/api/images/*` endpoints require a JWT Bearer token:

```
Authorization: Bearer <jwt>
```

Tokens are issued by the GlassCloud auth system (same as `/api/devices`).

---

## POST /api/images/upload

Upload an image with scene metadata.

### Request

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | yes | JPEG, PNG, or WebP; max 20 MB |
| `scene_description` | string | yes | AI-generated scene analysis text |
| `device_model` | string | yes | Device model identifier (e.g. `GlassBridge-1`) |
| `device_instance_id` | string | yes | Unique device instance ID |
| `captured_at` | string | no | ISO 8601 timestamp when photo was taken |

### Example

```bash
curl -X POST https://your-server/api/images/upload \
  -H "Authorization: Bearer <jwt>" \
  -F "image=@photo.jpg" \
  -F "scene_description=A busy street intersection with pedestrians" \
  -F "device_model=GlassBridge-1" \
  -F "device_instance_id=dev-001" \
  -F "captured_at=2026-02-19T10:30:00Z"
```

### Response `201 Created`

```json
{
  "imageId": "550e8400-e29b-41d4-a716-446655440000",
  "originalFilename": "550e8400-e29b-41d4-a716-446655440000.jpg",
  "thumbnailFilename": "550e8400-e29b-41d4-a716-446655440000_thumb.jpg",
  "receivedAt": 1708336200000,
  "capturedAt": 1708336200000
}
```

### Error Codes

| Status | Code | Description |
|---|---|---|
| 400 | `MISSING_FILE` | No image file in request |
| 400 | `MISSING_FIELD` | Required text field missing |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 413 | `FILE_TOO_LARGE` | File exceeds 20 MB |
| 415 | `UNSUPPORTED_TYPE` | File type not JPEG/PNG/WebP |
| 500 | `INTERNAL_ERROR` | Server-side failure |

---

## GET /api/images/:id

Retrieve metadata for a specific image by ID.

### Response `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "deviceModel": "GlassBridge-1",
  "deviceInstanceId": "dev-001",
  "sceneDescription": "A busy street intersection with pedestrians",
  "originalFilename": "550e8400-e29b-41d4-a716-446655440000.jpg",
  "thumbnailFilename": "550e8400-e29b-41d4-a716-446655440000_thumb.jpg",
  "capturedAt": 1708336200000,
  "receivedAt": 1708336200000,
  "createdAt": 1708336200000
}
```

---

## Static File Serving

Images are served via Express static middleware with long-lived caching:

| URL prefix | Source directory | Cache |
|---|---|---|
| `/images/originals/<filename>` | `./data/images/` | 1 day |
| `/images/thumbnails/<filename>` | `./data/thumbnails/` | 7 days |

### Examples

```
GET /images/originals/550e8400-e29b-41d4-a716-446655440000.jpg
GET /images/thumbnails/550e8400-e29b-41d4-a716-446655440000_thumb.jpg
```

---

## Gallery Web Page

The gallery is available for authenticated console users at:

```
GET /console/gallery?session=<sessionId>
```

Features:
- **Date/time range filter** — set From and To fields and click Apply
- **Paginated grid** — 20 images per page with Previous/Next controls
- **Lightbox** — click any thumbnail to view the full-size image in an overlay; press Escape or click outside to close
- Each card displays: thumbnail, scene description, date (captured if available, else received), device model, device instance ID
