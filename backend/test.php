<?php
require "config/db.php";

if ($conn) {
    echo "DB connected";
} else {
    echo "DB failed";
}
?>