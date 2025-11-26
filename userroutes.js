const express = require("express");
const { adduser, viewUsers, viewuser, deleteUsers, updateuser, loginuser, viewvisitors, addvisitor, me, scanQRCode, getVisitorQR } =require("./userController");
const authMiddleware =require("./authMiddleware");

const router = express.Router();

router.post("/adduser", adduser);
router.post("/addvisitor", addvisitor);
router.get("/viewusers", viewUsers);
router.get("/viewvisitors", viewvisitors);
router.get('/qr/:id', getVisitorQR);
router.get("/viewuser/:UID",  viewuser);
router.get("/me", authMiddleware, me);
router.post("/scan", scanQRCode);
router.delete("/deleteusers/:UID", deleteUsers);
router.put("/updateuser/:UID", updateuser);
router.post("/login", loginuser);




module.exports =router;

