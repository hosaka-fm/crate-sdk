function handler(event) {
  var req = event.request;
  var host = req.headers.host ? req.headers.host.value : '';
  // Legacy domain → 301 to the canonical hosaka.fm host. No standalone 0xhoneyjar page exists;
  // preserves inbound links (crate's landing) while eliminating the mirror.
  if (host === 'crate-sdk.0xhoneyjar.xyz') {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://crate-sdk.hosaka.fm' + req.uri } },
    };
  }
  // Directory-index rewrite for the canonical host.
  var uri = req.uri;
  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
  } else if (!uri.includes('.')) {
    req.uri = uri + '/index.html';
  }
  return req;
}
