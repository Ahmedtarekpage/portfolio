/* Where a client is from, as a flag and a name (owner, 2026-10-16: "country
   of clients in card with emoji, from the country code of the mobile").

   Country.of(client) reads the phone's international dialling code first
   (+20 → 🇪🇬 Egypt, +966 → 🇸🇦 Saudi Arabia, 00971… → 🇦🇪), longest code
   first, so +1 876 is Jamaica and not the US. A local number with no code
   tells nothing, so then the nationality field is read instead ("Egyptian",
   "KSA", "مصر"). Names come from the browser (Intl.DisplayNames), so there is
   no list of 200 names to keep here.

   Exposes window.Country = { of, fromPhone, fromName, flag }. */
(function () {
  "use strict";

  // dialling code → ISO 3166 region; where codes are shared, the main country
  var CODES = (
    "1:US 1242:BS 1246:BB 1264:AI 1268:AG 1284:VG 1340:VI 1345:KY 1441:BM 1473:GD 1649:TC 1664:MS 1670:MP " +
    "1671:GU 1684:AS 1721:SX 1758:LC 1767:DM 1784:VC 1787:PR 1809:DO 1829:DO 1849:DO 1868:TT 1869:KN 1876:JM 1939:PR " +
    "20:EG 211:SS 212:MA 213:DZ 216:TN 218:LY 220:GM 221:SN 222:MR 223:ML 224:GN 225:CI 226:BF 227:NE 228:TG 229:BJ " +
    "230:MU 231:LR 232:SL 233:GH 234:NG 235:TD 236:CF 237:CM 238:CV 239:ST 240:GQ 241:GA 242:CG 243:CD 244:AO 245:GW " +
    "248:SC 249:SD 250:RW 251:ET 252:SO 253:DJ 254:KE 255:TZ 256:UG 257:BI 258:MZ 260:ZM 261:MG 262:RE 263:ZW 264:NA " +
    "265:MW 266:LS 267:BW 268:SZ 269:KM 27:ZA 290:SH 291:ER 297:AW 298:FO 299:GL " +
    "30:GR 31:NL 32:BE 33:FR 34:ES 350:GI 351:PT 352:LU 353:IE 354:IS 355:AL 356:MT 357:CY 358:FI 359:BG 36:HU " +
    "370:LT 371:LV 372:EE 373:MD 374:AM 375:BY 376:AD 377:MC 378:SM 380:UA 381:RS 382:ME 383:XK 385:HR 386:SI 387:BA " +
    "389:MK 39:IT 40:RO 41:CH 420:CZ 421:SK 423:LI 43:AT 44:GB 45:DK 46:SE 47:NO 48:PL 49:DE " +
    "500:FK 501:BZ 502:GT 503:SV 504:HN 505:NI 506:CR 507:PA 508:PM 509:HT 51:PE 52:MX 53:CU 54:AR 55:BR 56:CL 57:CO " +
    "58:VE 590:GP 591:BO 592:GY 593:EC 594:GF 595:PY 596:MQ 597:SR 598:UY 599:CW " +
    "60:MY 61:AU 62:ID 63:PH 64:NZ 65:SG 66:TH 670:TL 673:BN 674:NR 675:PG 676:TO 677:SB 678:VU 679:FJ 680:PW 685:WS " +
    "686:KI 687:NC 689:PF 691:FM 692:MH 7:RU 76:KZ 77:KZ " +
    "81:JP 82:KR 84:VN 850:KP 852:HK 853:MO 855:KH 856:LA 86:CN 880:BD 886:TW " +
    "90:TR 91:IN 92:PK 93:AF 94:LK 95:MM 960:MV 961:LB 962:JO 963:SY 964:IQ 965:KW 966:SA 967:YE 968:OM 970:PS " +
    "971:AE 972:IL 973:BH 974:QA 975:BT 976:MN 977:NP 98:IR 992:TJ 993:TM 994:AZ 995:GE 996:KG 998:UZ"
  ).split(" ").reduce(function (m, pair) { var p = pair.split(":"); m[p[0]] = p[1]; return m; }, {});

  // +1 is shared by the US and Canada: Canada's area codes tell them apart
  var CANADA = " 204 226 236 249 250 263 289 306 343 354 365 367 368 382 403 416 418 428 431 437 438 450 468 474 506 " +
    "514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 ";

  // what people write in a nationality field, beyond the country's own name
  var WORDS = {
    egyptian: "EG", egypt: "EG", "مصر": "EG", "مصري": "EG", "مصرية": "EG",
    saudi: "SA", ksa: "SA", "saudi arabia": "SA", "السعودية": "SA", "سعودي": "SA", "سعودية": "SA",
    emirati: "AE", uae: "AE", emirates: "AE", "الإمارات": "AE", "الامارات": "AE", "إماراتي": "AE",
    kuwaiti: "KW", "الكويت": "KW", qatari: "QA", "قطر": "QA", omani: "OM", "عمان": "OM", bahraini: "BH", "البحرين": "BH",
    jordanian: "JO", "الأردن": "JO", lebanese: "LB", "لبنان": "LB", syrian: "SY", "سوريا": "SY", iraqi: "IQ", "العراق": "IQ",
    palestinian: "PS", "فلسطين": "PS", yemeni: "YE", "اليمن": "YE", sudanese: "SD", "السودان": "SD", libyan: "LY", "ليبيا": "LY",
    moroccan: "MA", "المغرب": "MA", tunisian: "TN", "تونس": "TN", algerian: "DZ", "الجزائر": "DZ",
    american: "US", usa: "US", us: "US", "united states": "US", british: "GB", uk: "GB", england: "GB", english: "GB",
    canadian: "CA", german: "DE", french: "FR", dutch: "NL", italian: "IT", spanish: "ES", irish: "IE", swiss: "CH",
    swedish: "SE", turkish: "TR", "türkiye": "TR", indian: "IN", pakistani: "PK", bangladeshi: "BD", nigerian: "NG",
    kenyan: "KE", "south african": "ZA", australian: "AU", malaysian: "MY", indonesian: "ID", filipino: "PH", chinese: "CN",
    japanese: "JP", korean: "KR", russian: "RU", ukrainian: "UA", polish: "PL", greek: "GR", portuguese: "PT", brazilian: "BR",
    mexican: "MX", iranian: "IR", afghan: "AF",
  };

  var names = null;
  function regionName(iso) {
    try {
      names = names || new Intl.DisplayNames(["en"], { type: "region" });
      return names.of(iso) || iso;
    } catch (e) { return iso; }
  }

  // two regional-indicator letters make the flag
  function flag(iso) {
    if (!/^[A-Z]{2}$/.test(iso)) return "🏳️";
    return String.fromCodePoint(0x1f1e6 + iso.charCodeAt(0) - 65, 0x1f1e6 + iso.charCodeAt(1) - 65);
  }

  function make(iso, from) {
    return { iso: iso, flag: flag(iso), name: regionName(iso), from: from };
  }

  function fromPhone(phone) {
    var raw = String(phone || "").trim();
    var digits;
    if (/^\+/.test(raw)) digits = raw.replace(/\D/g, "");
    else if (/^00/.test(raw.replace(/[\s()-]/g, ""))) digits = raw.replace(/\D/g, "").slice(2);
    // an Egyptian mobile written the local way: 010, 011, 012 or 015, 11 digits
    else if (/^01[0125]\d{8}$/.test(raw.replace(/\D/g, ""))) return make("EG", "phone");
    else return null; // any other local number carries no country
    for (var len = 4; len >= 1; len--) {
      var code = digits.slice(0, len);
      if (CODES[code]) {
        if (code === "1" && CANADA.indexOf(" " + digits.slice(1, 4) + " ") !== -1) return make("CA", "phone");
        return make(CODES[code], "phone");
      }
    }
    return null;
  }

  var byName = null;
  function fromName(text) {
    var t = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!t) return null;
    if (/^[a-z]{2}$/.test(t) && !WORDS[t]) return regionName(t.toUpperCase()) !== t.toUpperCase() ? make(t.toUpperCase(), "nationality") : null;
    if (WORDS[t]) return make(WORDS[t], "nationality");
    if (!byName) {
      byName = {};
      Object.keys(CODES).forEach(function (k) { byName[regionName(CODES[k]).toLowerCase()] = CODES[k]; });
      byName.canada = "CA";
    }
    if (byName[t]) return make(byName[t], "nationality");
    // "Egyptian, lives in Dubai" — the first word that means something
    var words = t.split(/[\s,/·-]+/);
    for (var i = 0; i < words.length; i++) {
      if (WORDS[words[i]]) return make(WORDS[words[i]], "nationality");
      if (byName[words[i]]) return make(byName[words[i]], "nationality");
    }
    return null;
  }

  function of(client) {
    return fromPhone(client && client.phone) || fromName(client && client.nationality);
  }

  window.Country = { of: of, fromPhone: fromPhone, fromName: fromName, flag: flag };
})();
