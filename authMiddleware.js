const jwt = require("jsonwebtoken");
require("dotenv").config();

const authMiddleware = (req, res, next) => {
    const token =req.header("Authorization");

    if(!token){
        return res.status(401).json({ message: "access denied. no token"})
    }

    try{
        const decoded= jwt.verify(token.replace("Bearer ",""), process.env.JWT_SECRET);
        req.users=decoded;
        next();
    }catch(error){
        res.status(400).json({ message: "invalid token"});
    }


}

module.exports = authMiddleware;