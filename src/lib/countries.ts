import type { Lang } from "@/lib/i18n";

const CODES = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");
const TOP = ["BR", "US", "PT", "AR", "MX", "CO", "CL", "ES", "GB", "CA"];

/** Country options: value = English name (what bookings already store), label = visitor's language. */
export function countryOptions(lang: Lang) {
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  const loc = new Intl.DisplayNames([lang === "pt" ? "pt-BR" : lang], { type: "region" });
  const opt = (c: string) => ({ value: en.of(c) ?? c, label: loc.of(c) ?? c });
  const rest = CODES.filter((c) => !TOP.includes(c)).map(opt).sort((a, b) => a.label.localeCompare(b.label, lang));
  return { top: TOP.map(opt), rest };
}
