# Translate
### GET /translate/`id`  
if DeepL is setup on the quartz instance, this route lets you translate anything under 500 characters, useful for mod/plugin descriptions.

**Query Parameters:**    
- `text`: The text you want to translate
- `target_lang`: The language you want to translate this to, ex: 'EN' or 'ES'