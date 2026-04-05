<?php
    //class user to insert user who have registerd into db and fetch the user for login process.
    class User{
        private $conn;

        public function _construct($db){
            $this->conn = $db;
        }

        // SIGNUP FUNCTION
         public function createUser($name, $email, $password, $phone, $address, $role = 'customer'){
            //hashing the password
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

            //writing SQL query
            $sql = "INSERT INTO users (name, email, password, phone, address, role)
                VALUES (?, ?, ?, ?, ?, ?)";

            //prepare the query to insert into db form sql injection
            $stmt = $this->conn->prepare($sql);

             //Execute with values
            $result = $stmt->execute([
            $name,
            $email,
            $hashedPassword,
            $phone,
            $address,
            $role
        ]);

            //return result (true/false) of inserting into db.
            return $result;

         }

        // *********** LOGIN FUNCTION
        public function getUserByEmail($email) {
        //SQL query
        $sql = "SELECT * FROM users WHERE email = ? LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user;
    }



    }




?>