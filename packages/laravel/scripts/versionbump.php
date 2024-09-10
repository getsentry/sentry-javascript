<?php

$re = '/[\d|x]+\.[\d|x]+.[\d|x]+(?:-\w+(?:\.\w+)?)?/m';
$path = __DIR__ . '/../src/Sentry/Laravel/Version.php';

file_put_contents($path, preg_replace($re, $argv[1], file_get_contents($path)));
