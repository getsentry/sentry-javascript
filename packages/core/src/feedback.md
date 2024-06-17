For reference, the fully built event looks something like this:

```json
{
  "type": "feedback",
  "event_id": "d2132d31b39445f1938d7e21b6bf0ec4",
  "timestamp": 1597977777.6189718,
  "dist": "1.12",
  "platform": "javascript",
  "environment": "production",
  "release": 42,
  "tags": { "transaction": "/organizations/:orgId/performance/:eventSlug/" },
  "sdk": { "name": "name", "version": "version" },
  "user": {
    "id": "123",
    "username": "user",
    "email": "user@site.com",
    "ip_address": "192.168.11.12"
  },
  "request": {
    "url": null,
    "headers": {
      "user-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15"
    }
  },
  "contexts": {
    "feedback": {
      "message": "test message",
      "contact_email": "test@example.com",
      "type": "feedback"
    },
    "trace": {
      "trace_id": "4C79F60C11214EB38604F4AE0781BFB2",
      "span_id": "FA90FDEAD5F74052",
      "type": "trace"
    },
    "replay": {
      "replay_id": "e2d42047b1c5431c8cba85ee2a8ab25d"
    }
  }
}
```
