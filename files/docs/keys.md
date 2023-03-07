# Encryption Keys

### GET /keys
This route sends a `panel-key.crt` file (private key) that may be used in the future by the panel's owner(s) to access encrypted items. The key will be deleted on the backend once it is grabbed.

**No Parameters**