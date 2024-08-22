
module.exports = (req, res, next) => {
    if (req.session.loggedin) {
        next(); // ถ้าเข้าสู่ระบบแล้วให้ดำเนินการต่อไปยังเส้นทางถัดไป
    } else {
        res.redirect('/'); // ถ้ายังไม่ได้เข้าสู่ระบบให้กลับไปที่หน้า login
    }
};
