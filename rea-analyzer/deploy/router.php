<?php
// Fejlesztői router a PHP beépített kiszolgálójához (php -S), hogy az Apache
// rewrite-viselkedést utánozza. XAMPP alatt NEM ez fut, hanem az .htaccess.
// Használat a projekt gyökeréből:
//   php -S 127.0.0.1:8080 deploy/router.php

$root = dirname(__DIR__);
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');

// API útvonalak → front controller
if (preg_match('#^/api/(.*)$#', $uri, $m)) {
    $_GET['_path'] = $m[1];
    require $root . '/api/index.php';
    return true;
}

// Érzékeny könyvtárak tiltása
if (preg_match('#^/(storage|config|worker|bin|tests|plugins|rea-src|node_modules)(/|$)#', $uri)) {
    http_response_code(403);
    echo '403 – tiltott';
    return true;
}

// Statikus fájl?
$file = $root . $uri;
if ($uri !== '/' && is_file($file)) {
    return false; // a beépített szerver szolgálja ki
}

// Alapértelmezés: index.html
require $root . '/index.html';
return true;
