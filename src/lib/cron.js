import cron from "cron";
import http from "http";

const job = cron.CronJob("*/14 * * * *", function () {
  http
    .get("https://seraj-api.onrender.com", (res) => {
      if (res.statusCode === 200) {
        console.log("Cron job executed");
      } else {
        console.log("Cron job failed", res.statusCode);
      }
    })
    .on("error", (err) => {
      console.log(err);
    });
});

export default job;
