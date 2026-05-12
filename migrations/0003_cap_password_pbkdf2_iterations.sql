UPDATE app_auth
SET password_hash = 'pbkdf2-sha256$100000$dmVuZGluZy1kMS1kZWZhdWx0LXNhbHQtMjAyNjA1MDU$kyDuylUYrOAl8qCMwVTvUqV46ta9cyUMcVRS5hDWMwo',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE singleton = 1
  AND username = 'admin'
  AND uses_default_password = 1
  AND password_hash = 'pbkdf2-sha256$210000$dmVuZGluZy1kMS1kZWZhdWx0LXNhbHQtMjAyNjA1MDU$wfwVBxS2juww7MMo5xC9Q3oUieqGk-ENSzBuRz6g_Hc';
