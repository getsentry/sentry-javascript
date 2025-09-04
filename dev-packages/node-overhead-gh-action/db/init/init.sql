CREATE DATABASE mydb;
USE mydb

-- SQL script to create the 'users' table and insert initial data.

-- 1. Create the 'users' table
-- This table stores basic user information.
-- 'id' is the primary key and will automatically increment for each new record.
-- 'name' stores the user's name, up to 255 characters.
-- 'age' stores the user's age as an integer.

CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    age INT
);

-- 2. Insert 5 rows into the 'users' table
-- Populating the table with some sample data.

INSERT INTO users (name, age) VALUES ('Alice Johnson', 28);
INSERT INTO users (name, age) VALUES ('Bob Smith', 45);
INSERT INTO users (name, age) VALUES ('Charlie Brown', 32);
INSERT INTO users (name, age) VALUES ('Diana Prince', 25);
INSERT INTO users (name, age) VALUES ('Ethan Hunt', 41);
