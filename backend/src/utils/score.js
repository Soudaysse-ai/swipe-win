function calcSpeedBonus(responseTimeMs) {
  return Math.max(0, 5 - Math.floor(responseTimeMs / 1000));
}

// Une seule réponse comptée par question (la première), même si la base
// contient des doublons historiques (audit S3).
function calcSessionScore(answers) {
  const seen = new Set();
  let total = 0;
  for (const a of answers) {
    if (seen.has(a.question_id)) continue;
    seen.add(a.question_id);
    if (a.is_correct) {
      total += 10 + calcSpeedBonus(a.response_time_ms);
    }
  }
  return total;
}

module.exports = { calcSpeedBonus, calcSessionScore };
