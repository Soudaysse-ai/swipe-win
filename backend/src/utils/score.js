function calcSpeedBonus(responseTimeMs) {
  return Math.max(0, 5 - Math.floor(responseTimeMs / 1000));
}

function calcSessionScore(answers) {
  let total = 0;
  for (const a of answers) {
    if (a.is_correct) {
      total += 10 + calcSpeedBonus(a.response_time_ms);
    }
  }
  return total;
}

module.exports = { calcSpeedBonus, calcSessionScore };
