-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Apr 05, 2026 at 09:17 PM
-- Server version: 10.4.28-MariaDB
-- PHP Version: 8.2.4

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `food_deliveryapp`
--

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `category` varchar(50) NOT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `rating` decimal(3,1) DEFAULT 4.5,
  `delivery_time` varchar(30) DEFAULT '30 min',
  `is_popular` tinyint(1) DEFAULT 0,
  `is_available` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `name`, `description`, `price`, `category`, `image_url`, `rating`, `delivery_time`, `is_popular`, `is_available`, `created_at`) VALUES
(1, 'Gourmet Burger & Fries', 'Juicy beef patty with fresh lettuce, tomato and cheese', 24.99, 'burger', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80', 4.8, '25 min', 1, 1, '2026-04-05 19:03:19'),
(2, 'Margherita Pizza', 'Classic pizza with tomato sauce, mozzarella and fresh basil', 18.99, 'pizza', 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&q=80', 4.7, '30 min', 1, 1, '2026-04-05 19:03:19'),
(3, 'Sushi Platter', 'Fresh assorted sushi with salmon, tuna and avocado rolls', 32.99, 'sushi', 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=400&q=80', 4.9, '40 min', 1, 1, '2026-04-05 19:03:19'),
(4, 'Chicken Tacos', 'Grilled chicken tacos with salsa, guacamole and sour cream', 14.99, 'tacos', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=80', 4.6, '20 min', 0, 1, '2026-04-05 19:03:19'),
(5, 'Pasta Carbonara', 'Creamy pasta with bacon, eggs, parmesan and black pepper', 16.99, 'pasta', 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400&q=80', 4.5, '25 min', 0, 1, '2026-04-05 19:03:19'),
(6, 'Caesar Salad', 'Crisp romaine lettuce, croutons, parmesan with caesar dressing', 12.99, 'salad', 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=400&q=80', 4.4, '15 min', 0, 1, '2026-04-05 19:03:19');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `role` varchar(20) DEFAULT 'customer',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `password`, `phone`, `address`, `role`, `created_at`) VALUES
(1, 'Pratyush Dahal', 'pratyushdahal33@gmail.com', '$2y$10$LpiaoUHdX6iWzVjjFvxCtupYZRHhOiDcaPvLHY1oKRH96THUQYTF6', '9849220167', 'Kathmandu, Nepal', 'customer', '2026-04-05 08:05:08'),
(2, 'Prashant Sigdel', 'prashant33@gmail.com', '$2y$10$2fGHiGm28F3z9PQ1XuvFx.wnJwaLGlN39Ae0fMmg.CDMhoEQVew.S', '9849220166', 'Kathmandu, Nepal', 'customer', '2026-04-05 08:10:24');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
