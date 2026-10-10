// Les « jours » (première partie du jour, plafond quotidien, joueurs actifs)
// sont comptés à l'heure des Comores.
const TZ = process.env.APP_TIMEZONE || 'Indian/Comoro';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// 'YYYY-MM-DD' local
function localDate(d = new Date()) {
  return fmt.format(d);
}

module.exports = { TZ, localDate };
