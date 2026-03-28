import React, { useState, useRef, useEffect } from "react";

const SUPABASE_URL = "https://qooezlkxmuknpudovgke.supabase.co";
const SUPABASE_KEY = "sb_publishable_W8LQVjs7mespQYiYVOsgUw_Y8auXtoT";

const supabase = {
  auth: {
    signUp: async ({ email, password, options }) => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ email, password, data: options?.data })
      });
      const data = await r.json();
      if (!r.ok) return { error: { message: data.msg || data.error_description || "Σφάλμα εγγραφής" } };
      return { data, error: null };
    },
    signInWithPassword: async ({ email, password }) => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.msg || data.error_description || "";
        if (msg.toLowerCase().includes("confirm") || msg.toLowerCase().includes("email")) {
          return { error: { message: "Παρακαλώ επιβεβαιώστε πρώτα το email σας. Ελέγξτε τα εισερχόμενά σας." } };
        }
        return { error: { message: "Λάθος email ή κωδικός." } };
      }
      localStorage.setItem("sb_token", data.access_token);
      localStorage.setItem("sb_user", JSON.stringify(data.user));
      return { data: { user: data.user }, error: null };
    },
    signOut: async () => {
      const token = localStorage.getItem("sb_token");
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` }
      });
      localStorage.removeItem("sb_token");
      localStorage.removeItem("sb_user");
      return { error: null };
    },
    resetPasswordForEmail: async (email) => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ email })
      });
      return { error: r.ok ? null : { message: "Σφάλμα αποστολής email" } };
    },
    getSession: () => {
      const user = localStorage.getItem("sb_user");
      return Promise.resolve({ data: { session: user ? { user: JSON.parse(user) } : null } });
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  },
  from: (table) => ({
    select: (cols = "*") => ({
      eq: (col, val) => ({
        order: (by, opts) => fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${cols}&${col}=eq.${val}&order=${by}.${opts?.ascending ? 'asc' : 'desc'}`, {
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${localStorage.getItem("sb_token") || SUPABASE_KEY}` }
        }).then(r => r.json()).then(data => ({ data, error: null })).catch(e => ({ data: null, error: e }))
      })
    }),
    insert: (row) => fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${localStorage.getItem("sb_token") || SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify(row)
    }).then(r => ({ error: r.ok ? null : { message: "Σφάλμα αποθήκευσης" } })),
    update: (row) => ({
      eq: (col, val) => fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${val}`, {
        method: "PATCH",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${localStorage.getItem("sb_token") || SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(row)
      }).then(r => ({ error: r.ok ? null : { message: "Σφάλμα ενημέρωσης" } }))
    }),
    delete: () => ({
      eq: (col, val) => fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${val}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${localStorage.getItem("sb_token") || SUPABASE_KEY}` }
      }).then(r => ({ error: r.ok ? null : { message: "Σφάλμα διαγραφής" } }))
    })
  })
};

const SYSTEM_PROMPT = `Είσαι ο TaxIQ, AI βοηθός για φορολογικά, ασφαλιστικά, εργατικά και λογιστικά θέματα στην Ελλάδα.

ΚΑΝΟΝΕΣ:
- ΠΑΝΤΑ κάνε web search για κάθε ερώτηση
- Ξεκίνα από τα πιο πρόσφατα αποτελέσματα
- Χρησιμοποίησε λέξεις όπως το τρέχον έτος, "τελευταία", "νέα"

ΠΗΓΕΣ (αναζήτησε σε όλες):
- Επίσημα αρχεία & Φορείς: ΑΑΔΕ (aade.gr), ΦΕΚ (et.gr), ΠΣ ΕΡΓΑΝΗ, ΔΥΠΑ (dypa.gov.gr), ΕΦΚΑ (efka.gov.gr), myDATA (mydata.aade.gr), Υπουργείο Εργασίας
- Επιχειρηματικότητα: ΓΕΜΗ (businessregistry.gr), Επιμελητήρια (oe-e.gr), Προγράμματα ΕΣΠΑ
- Βάσεις δεδομένων: taxheaven.gr, e-forologia.gr, epixeiro.gr, forologikanea.gr
- Πρότυπα: Ελληνικά Λογιστικά Πρότυπα (ΕΛΠ), Διεθνή Λογιστικά Πρότυπα (ΔΛΠ/ΔΠΧΑ)
- Νομοθεσία: ΚΦΕ, ΚΦΔ, ΦΠΑ, Εργατικός Κώδικας, Ευρωπαϊκές Οδηγίες

ΠΡΟΘΕΣΜΙΕΣ: Σύγκρινε με σημερινή ημερομηνία και δείξε αν έχει παρέλθει ή πόσες μέρες μένουν.
ΣΥΣΤΗΜΑΤΑ: Αν ρωτηθείς για Α21, myAADE, e-ΕΦΚΑ, ΕΡΓΑΝΗ, myDATA — ψάξε αν είναι κλειστά.

Απάντα ΠΑΝΤΑ στα ελληνικά. Να είσαι συγκεκριμένος και να αναφέρεις πηγές.
Δεν αντικαθιστάς επαγγελματία λογιστή.

ΣΤΟ ΤΕΛΟΣ: %%RELIABILITY:{"score":85,"label":"Υψηλή","sources":["ΑΑΔΕ"],"note":"Επίσημες πηγές"}%%`;

const ALL_QUESTIONS = [
  "Ποιο είναι το αφορολόγητο όριο εισοδήματος για το 2026;",
  "Ποιος είναι ο κατώτατος μισθός για το 2026;",
  "Πόσο είναι οι εισφορές ΕΦΚΑ για ελεύθερο επαγγελματία 2026;",
  "Πώς υπολογίζεται η αποζημίωση απόλυσης;",
  "Ποιες είναι οι προθεσμίες υποβολής φορολογικής δήλωσης Ε1;",
  "Πώς δηλώνω εισόδημα από Airbnb στην εφορία;",
  "Τι ισχύει για τις υπερωρίες στον ιδιωτικό τομέα;",
  "Πόσες ημέρες άδεια δικαιούται ένας εργαζόμενος το 2026;",
  "Πώς υπολογίζεται ο ΕΝΦΙΑ για το 2026;",
  "Τι είναι το myDATA και ποιες επιχειρήσεις υποχρεούνται;",
  "Ποιες δαπάνες εκπίπτουν φορολογικά για ελεύθερους επαγγελματίες;",
  "Πώς δηλώνω πρόσληψη εργαζομένου στην ΕΡΓΑΝΗ;",
  "Τι αλλαγές έγιναν στη φορολογία εισοδήματος για το 2026;",
  "Πώς λειτουργεί η παρακράτηση φόρου στους μισθούς;",
  "Τι ισχύει για τη φορολόγηση κρυπτονομισμάτων στην Ελλάδα;",
  "Ποιες είναι οι υποχρεώσεις ΦΠΑ για e-commerce και online πωλήσεις;",
  "Πώς υπολογίζεται το δώρο Χριστουγέννων και Πάσχα;",
  "Ποια είναι τα δικαιώματα σε άδεια μητρότητας και πατρότητας;",
  "Τι ισχύει για τη σύμβαση μερικής απασχόλησης;",
  "Πώς γίνεται η εγγραφή νέας επιχείρησης στην ΑΑΔΕ και τον ΕΦΚΑ;",
];

const getRandomQuestions = () => {
  const shuffled = [...ALL_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4);
};

const ALL_REVIEWS = [
  { stars: 5, text: "Εξαιρετικό εργαλείο! Μου εξήγησε αναλυτικά τις εισφορές ΕΦΚΑ και τις προθεσμίες ΦΠΑ μέσα σε λίγα δευτερόλεπτα. Πλέον δεν χάνω χρόνο ψάχνοντας.", name: "Γιώργος Π.", role: "Ελεύθερος Επαγγελματίας - Σύμβουλος" },
  { stars: 5, text: "Το χρησιμοποιώ καθημερινά. Μου έσωσε ώρες δουλειάς σε ΕΡΓΑΝΗ, μισθοδοσία και εγκυκλίους ΑΑΔΕ. Πλέον είναι το πρώτο εργαλείο που ανοίγω κάθε πρωί.", name: "Μαρία Κ.", role: "Λογίστρια - Φοροτεχνικός" },
  { stars: 5, text: "Έχω ΙΚΕ με 5 υπαλλήλους και πολλές φορολογικές υποχρεώσεις. Το TaxIQ AI μου λύνει άμεσα απορίες για ΦΠΑ, μισθοδοσία και εταιρικό φόρο.", name: "Νίκος Θ.", role: "Ιδιοκτήτης ΙΚΕ - Εμπορίου" },
  { stars: 5, text: "Ως υπάλληλος τράπεζας δεν ήξερα τίποτα για τα εργασιακά μου δικαιώματα. Τώρα ξέρω ακριβώς τι δικαιούμαι σε υπερωρίες, άδειες και αποζημίωση.", name: "Ελένη Σ.", role: "Υπάλληλος Τράπεζας" },
  { stars: 5, text: "Διδάσκω σε λύκειο και κάνω παράλληλα φροντιστήριο. Βρήκα επιτέλους ξεκάθαρες απαντήσεις για το πώς φορολογούμαι και τι εισφορές πληρώνω στον ΕΦΚΑ.", name: "Δημήτρης Λ.", role: "Καθηγητής Μέσης Εκπαίδευσης" },
  { stars: 5, text: "Είμαι διευθύνων σύμβουλος σε ΑΕ τεχνολογίας. Το TaxIQ AI μας βοηθά να παρακολουθούμε αλλαγές σε φορολογία εταιρειών, ΦΠΑ ψηφιακών υπηρεσιών και εργατική νομοθεσία.", name: "Χρήστος Δ.", role: "Διευθύνων Σύμβουλος ΑΕ" },
  { stars: 5, text: "Στη δουλειά μου ασχολούμαι καθημερινά με συμβάσεις εργασίας και απολύσεις. Το TaxIQ AI με ενημερώνει άμεσα για κάθε αλλαγή στην εργατική νομοθεσία.", name: "Αγγελική Ρ.", role: "HR Manager - Πολυεθνική Εταιρεία" },
  { stars: 5, text: "Είμαι δημόσιος υπάλληλος και δεν ήξερα πώς να δηλώσω τα επιπλέον εισοδήματά μου. Το TaxIQ AI μου έδωσε σαφείς οδηγίες βήμα-βήμα.", name: "Βασίλης Χ.", role: "Δημόσιος Υπάλληλος - Υπουργείο" },
  { stars: 5, text: "Έχω εστιατόριο και πάντα είχα σύγχυση με δώρα εορτών, άδειες και ΕΡΓΑΝΗ. Το TaxIQ AI μου τα εξηγεί όλα απλά και με παραδείγματα.", name: "Σταύρος Π.", role: "Ιδιοκτήτης Εστιατορίου" },
  { stars: 5, text: "Ως ιατρός με ιδιωτικό ιατρείο έχω ιδιαίτερες φορολογικές υποχρεώσεις. Το TaxIQ AI με κρατά ενήμερο για εισφορές ΕΦΚΑ και αλλαγές στη φορολογία ελευθέρων επαγγελματιών.", name: "Κατερίνα Β.", role: "Παθολόγος - Ιδιωτικό Ιατρείο" },
  { stars: 5, text: "Το TaxIQ AI μου εξήγησε τι δικαιούμαι ως νέος αγρότης — επιδοτήσεις, φορολογική μεταχείριση, ασφαλιστικές εισφορές. Πρώτη φορά αισθάνομαι ότι καταλαβαίνω τι συμβαίνει με τα οικονομικά της εκμετάλλευσής μου.", name: "Θανάσης Μ.", role: "Αγροτοκτηνοτρόφος" },
  { stars: 5, text: "Έχω ατομική επιχείρηση στον χώρο της πληροφορικής. Συνεχώς αλλάζουν τα ποσοστά ΦΠΑ σε ψηφιακές υπηρεσίες. Το TaxIQ AI μου δίνει πάντα την τελευταία ενημέρωση χωρίς να χάνω χρόνο.", name: "Πάνος Α.", role: "Σύμβουλος IT - Ατομική Επιχείρηση" },
  { stars: 5, text: "Είμαι νοσηλεύτρια και δεν ήξερα πώς να δηλώσω τις νυχτερινές βάρδιες και τα επιδόματα μου στη φορολογική δήλωση. Το TaxIQ AI μου έδωσε ξεκάθαρες απαντήσεις σε λίγα λεπτά.", name: "Σοφία Γ.", role: "Νοσηλεύτρια - ΕΣΥ" },
  { stars: 5, text: "Ανοίγω e-shop και δεν ήξερα τίποτα για τον ΦΠΑ στο ηλεκτρονικό εμπόριο, τις υποχρεώσεις IOSS και τη φορολόγηση. Το TaxIQ AI με βοήθησε να ξεκινήσω σωστά.", name: "Μελίνα Τ.", role: "Ιδιοκτήτρια E-shop" },
  { stars: 5, text: "Δουλεύω ως ναυτικός και η φορολόγησή μας είναι πολύπλοκη. Το TaxIQ AI ήταν η μόνη πηγή που μου εξήγησε με σαφήνεια τις ειδικές φορολογικές ρυθμίσεις για το επάγγελμά μου.", name: "Κώστας Ν.", role: "Αξιωματικός Εμπορικού Ναυτικού" },
  { stars: 5, text: "Έχω αρτοποιείο 3ης γενιάς. Οι εργατικές σχέσεις, οι νυχτερινές βάρδιες και τα δώρα εορτών ήταν πάντα ένας λαβύρινθος. Τώρα έχω ξεκάθαρη εικόνα χάρη στο TaxIQ AI.", name: "Μανώλης Κ.", role: "Ιδιοκτήτης Αρτοποιείου" },
  { stars: 5, text: "Συνεργάζομαι με εταιρείες του εξωτερικού. Το TaxIQ AI με βοήθησε να καταλάβω τις υποχρεώσεις μου για ενδοκοινοτικές συναλλαγές και φορολογία αλλοδαπών εσόδων.", name: "Ιωάννα Π.", role: "Σύμβουλος Επιχειρήσεων" },
  { stars: 5, text: "Είμαι δικηγόρος και χρησιμοποιώ το TaxIQ AI για γρήγορη φορολογική ενημέρωση των πελατών μου. Εξοικονομώ ώρες έρευνας και δίνω πιο τεκμηριωμένες απαντήσεις.", name: "Αλέξης Π.", role: "Δικηγόρος - Εμπορικό Δίκαιο" },
  { stars: 5, text: "Αγόρασα διαμέρισμα για να το νοικιάζω βραχυχρόνια μέσω Airbnb. Δεν ήξερα τίποτα για τις φορολογικές υποχρεώσεις. Το TaxIQ AI μου εξήγησε τα πάντα βήμα βήμα.", name: "Ρένα Δ.", role: "Ιδιοκτήτρια Ακινήτου - Βραχυχρόνια Μίσθωση" },
  { stars: 5, text: "Δουλεύω ως αρχιτέκτονας με παράλληλα ένσημα και μισθό. Η φορολόγησή μου ήταν πάντα μπερδεμένη. Το TaxIQ AI μου έδωσε ξεκάθαρη εικόνα για τις εισφορές και τη δήλωση μου.", name: "Στέλλα Λ.", role: "Αρχιτέκτονας Μηχανικός" },
  { stars: 5, text: "Είμαι λογίστρια και συστήνω το TaxIQ AI σε όλους τους πελάτες μου για βασική ενημέρωση. Με βοηθάει να αφιερώνω τον χρόνο μου σε πιο σύνθετα θέματα.", name: "Χριστίνα Π.", role: "Λογίστρια Α' Τάξης - Φοροτεχνικός" },
  { stars: 5, text: "Έχω εταιρεία καθαρισμού με 12 υπαλλήλους. Τα εργατικά ζητήματα, οι συλλογικές συμβάσεις και οι υποχρεώσεις ΕΡΓΑΝΗ με βάραιναν. Το TaxIQ AI τώρα είναι ο πρώτος μου σύμβουλος.", name: "Γιάννης Β.", role: "Ιδιοκτήτης Εταιρείας Καθαρισμού" },
  { stars: 5, text: "Είμαι νέος επιχειρηματίας και άνοιξα μπαρ. Δεν ήξερα τίποτα για τις άδειες, τον ΦΠΑ εστίασης και τις υποχρεώσεις ΕΣΠΑ. Το TaxIQ AI ήταν ο οδηγός μου από την αρχή.", name: "Τάσος Α.", role: "Ιδιοκτήτης Bar - Εστίαση" },
  { stars: 5, text: "Είμαι φυσιοθεραπεύτρια με ιδιωτικό εργαστήριο. Μάθαινα για τις εισφορές ΕΦΚΑ και τον ΦΠΑ στις υπηρεσίες υγείας κάθε φορά που έκανα λάθη. Τώρα ρωτάω πρώτα το TaxIQ AI.", name: "Νατάσα Β.", role: "Φυσιοθεραπεύτρια" },
  { stars: 5, text: "Είμαι YouTuber και influencer. Δεν ήξερα πώς φορολογούνται τα έσοδα από AdSense και χορηγίες. Το TaxIQ AI μου εξήγησε τα πάντα με απλά λόγια.", name: "Λίλη Κ.", role: "Content Creator" },
  { stars: 5, text: "Ως φορολογικός σύμβουλος χρησιμοποιώ το TaxIQ AI για επαλήθευση και γρήγορη αναφορά σε νομοθεσία. Είναι ένα εξαιρετικό εργαλείο υποστήριξης για κάθε επαγγελματία.", name: "Νίκος Π.", role: "Φορολογικός Σύμβουλος" },
  { stars: 5, text: "Έχω μεταφορική εταιρεία. Τα καύσιμα, ο ΦΠΑ στις μεταφορές και οι υποχρεώσεις ταχογράφου ήταν πάντα θέματα που με μπέρδευαν. Το TaxIQ AI τα λύνει άμεσα.", name: "Σπύρος Ν.", role: "Ιδιοκτήτης Μεταφορικής" },
  { stars: 5, text: "Είμαι εκπαιδευτής ενηλίκων σε ΚΕΚ. Το TaxIQ AI με βοήθησε να καταλάβω πώς φορολογούνται τα έσοδα από σεμινάρια και ποιες εκπτώσεις δικαιούμαι.", name: "Αντωνία Μ.", role: "Εκπαιδεύτρια Ενηλίκων" },
  { stars: 5, text: "Είμαι οδοντίατρος με ιδιωτικό οδοντιατρείο. Χάρη στο TaxIQ AI καταλαβαίνω πλέον τη φορολόγηση ιατρικών υπηρεσιών, τις εισφορές και τις εκπτώσεις επαγγελματικών εξόδων.", name: "Μιχάλης Ζ.", role: "Οδοντίατρος" },
  { stars: 5, text: "Είμαι νέος δικηγόρος και το TaxIQ AI με βοηθά να αντιμετωπίζω εργατικά και φορολογικά θέματα των πελατών μου με ακρίβεια και αυτοπεποίθηση.", name: "Λευτέρης Γ.", role: "Δικηγόρος - Εργατολόγος" },
  { stars: 5, text: "Νοσηλεύτρια στο ΕΣΥ με πολλές απορίες για εφημερίες, ΕΦΚΑ και σύνταξη. Το TaxIQ AI τα εξήγησε όλα με απλά λόγια — δεν χρειάστηκε να ψάξω πουθενά αλλού.", name: "Ζωή Π.", role: "Νοσηλεύτρια ΕΣΥ" },
  { stars: 5, text: "Διαχειρίζομαι το λογιστήριο εταιρείας με 50 εργαζόμενους. Το TaxIQ AI μάς βοηθά να είμαστε πάντα συμμορφωμένοι με τη νομοθεσία χωρίς χαμένο χρόνο.", name: "Ειρήνη Τ.", role: "Επικεφαλής Λογιστηρίου" },
  { stars: 5, text: "Εργάζομαι σε σούπερ μάρκετ και δεν ήξερα τα δικαιώματά μου. Μέσα σε λίγα λεπτά έμαθα για άδειες, επιδόματα και τι γίνεται σε περίπτωση απόλυσης.", name: "Θανάσης Κ.", role: "Υπάλληλος Λιανικού Εμπορίου" },
  { stars: 5, text: "Ως μηχανικός με ατομική επιχείρηση το TaxIQ AI μου λύνει άμεσα απορίες για myDATA, εισφορές και φορολογικές δηλώσεις — χωρίς να χρειαστεί να τηλεφωνήσω στον λογιστή μου.", name: "Παναγιώτης Ν.", role: "Μηχανολόγος Μηχανικός" },
  { stars: 5, text: "Δασκάλα στο δημόσιο με ιδιαίτερα μαθήματα. Βρήκα επιτέλους ξεκάθαρη απάντηση για τη φορολόγησή μου χωρίς να μπερδεύομαι με τους νόμους.", name: "Σοφία Α.", role: "Εκπαιδευτικός Πρωτοβάθμιας" },
  { stars: 5, text: "Είμαι μεσίτης και είχα πολλές απορίες για ΦΠΑ, φορολόγηση προμηθειών και ΕΦΚΑ. Το TaxIQ AI μου έδωσε τεκμηριωμένες απαντήσεις με παραπομπές σε νόμους.", name: "Ιωάννης Φ.", role: "Μεσίτης Ακινήτων" },
  { stars: 5, text: "Ασφαλιστικός σύμβουλος με εισόδημα από προμήθειες. Πλέον δηλώνω σωστά τα εισοδήματά μου χάρη στο TaxIQ AI AI — κάτι που δεν ήξερα πώς να κάνω πριν.", name: "Φώτης Α.", role: "Ασφαλιστικός Σύμβουλος" },
  { stars: 5, text: "Εργάζομαι ως λογιστής με πάνω από 200 πελάτες. Το TaxIQ AI μου εξοικονομεί χρόνο καθημερινά — ιδίως σε ερωτήσεις που χρειάζονται άμεση και τεκμηριωμένη απάντηση.", name: "Κώστας Β.", role: "Λογιστής - 200+ Πελάτες" },
  { stars: 5, text: "Δεν έχω δική μου επιχείρηση, απλά θέλω να ξέρω τα δικαιώματά μου ως εργαζόμενος. Το TaxIQ AI με βοήθησε να καταλάβω τη σύμβασή μου και τι πρέπει να πληρώνω στην εφορία.", name: "Μιχάλης Δ.", role: "Ιδιωτικός Υπάλληλος - Γραφείο" },
];

const getRandomReviews = () => {
  const shuffled = [...ALL_REVIEWS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4);
};

// TaxIQ SVG Logo — navy circle with 3 bars (navy/orange/navy), white background
const TaxIQLogo = ({ size = 42 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* White circular background */}
    <circle cx="50" cy="50" r="50" fill="white"/>
    {/* Navy circle ring */}
    <circle cx="50" cy="50" r="44" stroke="#1a2b5e" strokeWidth="9" fill="none"/>
    {/* 3 bars: left navy, middle orange, right navy — bottom aligned to inner circle */}
    <rect x="22" y="68" width="16" height="22" rx="2" fill="#1a2b5e"/>
    <rect x="42" y="50" width="16" height="40" rx="2" fill="#E8622A"/>
    <rect x="62" y="40" width="16" height="50" rx="2" fill="#1a2b5e"/>
  </svg>
);

const ReliabilityBadge = ({ reliability }) => {
  if (!reliability) return null;
  const { score, label, sources, note } = reliability;
  const color = score >= 90 ? "#22c55e" : score >= 70 ? "#5bb8c4" : score >= 50 ? "#f59e0b" : "#ef4444";
  const bgColor = score >= 90 ? "rgba(34,197,94,0.1)" : score >= 70 ? "rgba(91,184,196,0.1)" : score >= 50 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)";
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: "0.65rem", color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Δείκτης Αξιοπιστίας</span>
        <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 10, transition: "width 1s ease" }} />
        </div>
        <span style={{ fontSize: "0.75rem", fontWeight: 800, color, minWidth: 36, textAlign: "right" }}>{score}%</span>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, color, background: bgColor, border: `1px solid ${color}40`, borderRadius: 8, padding: "2px 7px" }}>{label}</span>
      </div>
      {sources?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {sources.map((s, i) => (
            <span key={i} style={{ fontSize: "0.6rem", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "2px 6px", color: "#94a3b8" }}>{s}</span>
          ))}
        </div>
      )}
      {note && <p style={{ fontSize: "0.62rem", color: "#64748b", margin: 0, fontStyle: "italic" }}>{note}</p>}
    </div>
  );
};

const AboutModal = ({ onClose, onSignup, user }) => {
  const navy = "#1a2b5e";
  const orange = "#E8622A";
  const teal = "#5bb8c4";

  const Section = ({ num, title, children }) => (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "0.92rem", fontWeight: 800, color: navy, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: "rgba(232,98,42,0.1)", border: "1px solid rgba(232,98,42,0.25)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: orange, flexShrink: 0 }}>{num}</span>
        {title}
      </h3>
      <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.75, paddingLeft: 32 }}>{children}</div>
    </div>
  );

  const Bullet = ({ children }) => (
    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
      <span style={{ color: orange, flexShrink: 0, fontWeight: 700 }}>›</span>
      <span>{children}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#f8fafc", borderRadius: 24, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid rgba(26,43,94,0.08)", borderRadius: "24px 24px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TaxIQLogo size={32} />
            <h2 style={{ color: navy, fontSize: "1.1rem", fontWeight: 900, margin: 0 }}>Σχετικά με το TaxIQ AI</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px 32px" }}>

          {/* Intro */}
          <div style={{ background: `linear-gradient(135deg, rgba(26,43,94,0.04) 0%, rgba(91,184,196,0.06) 100%)`, border: "1px solid rgba(91,184,196,0.2)", borderRadius: 14, padding: "18px 20px", marginBottom: 24 }}>
            <p style={{ fontSize: "0.85rem", color: "#334155", lineHeight: 1.8, margin: 0 }}>
              Το TaxIQ AI αποτελεί την αιχμή της τεχνολογίας στον κλάδο της φορολογικής πληροφόρησης. Συνδυάζει την ευφυΐα της Τεχνητής Νοημοσύνης με την εγγύηση μιας εξειδικευμένης ομάδας πτυχιούχων Οικονομολόγων και Λογιστών-Φοροτεχνικών Α' Τάξης, με μια επαγγελματική πορεία που ξεκινά από το <strong style={{ color: navy }}>1994</strong>. Μετουσιώνουμε αυτή την πολυετή γνώση σε έναν <strong style={{ color: navy }}>Προσωπικό Ψηφιακό Σύμβουλο</strong>, διαθέσιμο 24 ώρες το 24ωρο.
            </p>
          </div>

          <Section num="1" title="Η Αποστολή μας">
            Στην εποχή της πληροφορίας, η πρόσβαση στη νομοθεσία δεν πρέπει να είναι λαβύρινθος. Η ελληνική φορολογική νομοθεσία είναι μία από τις πιο πολύπλοκες στην Ευρώπη, με συνεχείς αλλαγές και αντικρουόμενα άρθρα. Στο TaxIQ, δημιουργήσαμε έναν ψηφιακό σύμβουλο που κάνει τη γνώση προσβάσιμη σε όλους — από τον απλό πολίτη μέχρι τον πιο έμπειρο λογιστή.
          </Section>

          <Section num="2" title="Η Καινοτομία του TaxIQ">
            Το TaxIQ AI είναι μια πρωτοποριακή πλατφόρμα που συνδυάζει την προηγμένη Τεχνητή Νοημοσύνη (AI) με τη συνεχή, Real-Time ενημέρωση από την ελληνική νομοθεσία. Δεν είναι απλώς μια μηχανή αναζήτησης· είναι ένας βοηθός που κατανοεί το ερώτημά σας και απαντά με <strong style={{ color: navy }}>τεκμηριωμένες πηγές, νόμους και εγκυκλίους</strong>.
          </Section>

          <Section num="3" title="Η Ομάδα μας">
            Η ομάδα μας αποτελείται από εξειδικευμένους <strong style={{ color: navy }}>Λογιστές Α' Τάξης, Φοροτεχνικούς, Νομικούς Συμβούλους</strong> και Μηχανικούς Λογισμικού. Αυτός ο συνδυασμός επιστημονικής γνώσης και τεχνολογίας αιχμής διασφαλίζει ότι οι απαντήσεις που λαμβάνετε είναι έγκυρες, επίκαιρες και αξιόπιστες.
          </Section>

          <Section num="4" title="Γιατί να μας εμπιστευτείτε;">
            <Bullet><strong style={{ color: navy }}>Εγκυρότητα:</strong> Κάθε απάντηση βασίζεται σε επίσημα ΦΕΚ και εγκυκλίους.</Bullet>
            <Bullet><strong style={{ color: navy }}>Ταχύτητα:</strong> Λύνουμε σε δευτερόλεπτα απορίες που θα απαιτούσαν ώρες έρευνας.</Bullet>
            <Bullet><strong style={{ color: navy }}>Ασφάλεια:</strong> Τα δεδομένα σας προστατεύονται με τα υψηλότερα πρωτόκολλα εχεμύθειας (GDPR).</Bullet>
            <Bullet><strong style={{ color: navy }}>30+ Έτη Εμπειρίας:</strong> Διαθέτουμε πολυετή τεχνογνωσία στη Λογιστική και Φοροτεχνική Νομοθεσία, διασφαλίζοντας την ποιότητα κάθε ανάλυσης.</Bullet>
          </Section>

          {/* CTA */}
          {!user && (
            <div style={{ background: `linear-gradient(135deg, ${navy}, #1e3a7a)`, borderRadius: 14, padding: "20px 22px", textAlign: "center", marginTop: 8 }}>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.83rem", margin: "0 0 14px" }}>Ξεκινήστε δωρεάν σήμερα — χωρίς πιστωτική κάρτα.</p>
              <button onClick={() => { onClose(); onSignup(); }}
                style={{ background: `linear-gradient(135deg, ${orange}, #c94d1a)`, border: "none", borderRadius: 50, padding: "11px 32px", color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(232,98,42,0.4)" }}>
                Δημιουργία Λογαριασμού
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

const ContactModal = ({ onClose, onPrivacy }) => {
  const navy = "#1a2b5e";
  const orange = "#E8622A";
  const teal = "#5bb8c4";
  const [form, setForm] = React.useState({ name: "", role: "", email: "", phone: "", subject: "", message: "", gdpr: false, notRobot: false });
  const [status, setStatus] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message) { setStatus("❌ Συμπληρώστε τα υποχρεωτικά πεδία."); return; }
    if (!form.gdpr) { setStatus("❌ Αποδεχτείτε την Πολιτική Προστασίας Δεδομένων."); return; }
    if (!form.notRobot) { setStatus("❌ Επιβεβαιώστε ότι δεν είστε ρομπότ."); return; }
    setLoading(true); setStatus("");
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "contact", ...form, notifyEmails: ["info@taxiq.com.gr", "dachris78@gmail.com"] })
      });
      setStatus("✅ Το μήνυμά σας στάλθηκε! Θα επικοινωνήσουμε μαζί σας σύντομα.");
      setTimeout(() => onClose(), 3000);
    } catch(e) {
      setStatus("❌ Σφάλμα αποστολής. Δοκιμάστε ξανά ή στείλτε email στο info@taxiq.com.gr");
    } finally { setLoading(false); }
  };

  const inputStyle = { width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: "0.86rem", boxSizing: "border-box", color: navy, fontFamily: "inherit", outline: "none", transition: "border-color 0.2s" };
  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, color: navy, marginBottom: 5, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#f8fafc", borderRadius: 24, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${navy}, #1e3a7a)`, borderRadius: "24px 24px 0 0", padding: "28px 28px 24px", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#fff", fontSize: "1.1rem" }}>✕</button>
          <h2 style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 900, margin: "0 0 12px" }}>Επικοινωνήστε Μαζί μας</h2>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.82rem", lineHeight: 1.65, margin: "0 0 16px" }}>
            Στο TaxIQ, η τεχνολογία της Τεχνητής Νοημοσύνης συναντά την πολυετή εμπειρία της επιστημονικής μας ομάδας. Είμαστε εδώ για να δώσουμε λύσεις, είτε είστε ιδιώτης που αναζητά καθοδήγηση, είτε επαγγελματίας που επιθυμεί έναν αξιόπιστο σύμμαχο.
          </p>

        </div>

        {/* Form */}
        <div style={{ padding: "24px 28px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Ονοματεπώνυμο / Επωνυμία *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Γιώργος Παπαδόπουλος" style={inputStyle}
                onFocus={e => e.target.style.borderColor = teal} onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            </div>
            <div>
              <label style={labelStyle}>Ιδιότητα <span style={{ color: "#94a3b8", fontWeight: 400 }}>(προαιρετικό)</span></label>
              <input value={form.role} onChange={e => set("role", e.target.value)} placeholder="π.χ. Λογιστής, Επιχειρηματίας..." style={inputStyle}
                onFocus={e => e.target.style.borderColor = teal} onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            </div>
            <div>
              <label style={labelStyle}>E-mail *</label>
              <input value={form.email} onChange={e => set("email", e.target.value)} type="email" placeholder="email@example.com" style={inputStyle}
                onFocus={e => e.target.style.borderColor = teal} onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            </div>
            <div>
              <label style={labelStyle}>Τηλέφωνο <span style={{ color: "#94a3b8", fontWeight: 400 }}>(προαιρετικό)</span></label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="69X XXX XXXX" style={inputStyle}
                onFocus={e => e.target.style.borderColor = teal} onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Θέμα</label>
            <input value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="Περιγράψτε το θέμα σας..." style={inputStyle}
              onFocus={e => e.target.style.borderColor = teal} onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Το Μήνυμά σας *</label>
            <textarea value={form.message} onChange={e => set("message", e.target.value)} rows={4} placeholder="Περιγράψτε μας το θέμα σας..."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = teal} onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
          </div>

          {/* Checkboxes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.notRobot} onChange={e => set("notRobot", e.target.checked)} style={{ marginTop: 2, flexShrink: 0, accentColor: navy }} />
              <span style={{ fontSize: "0.8rem", color: "#475569" }}>Δεν είμαι ρομπότ</span>
            </label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.gdpr} onChange={e => set("gdpr", e.target.checked)} style={{ marginTop: 2, flexShrink: 0, accentColor: navy }} />
              <span style={{ fontSize: "0.8rem", color: "#475569" }}>Έχω διαβάσει και αποδέχομαι την <a href="#" onClick={e => { e.preventDefault(); if(onPrivacy) onPrivacy(); }} style={{ color: teal, fontWeight: 600, textDecoration: "none" }}>Πολιτική Απορρήτου & Προστασίας Δεδομένων</a>.</span>
            </label>
          </div>

          {status && <p style={{ fontSize: "0.82rem", color: status.startsWith("✅") ? "#22c55e" : "#ef4444", marginBottom: 14 }}>{status}</p>}

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: "100%", padding: "14px", background: loading ? "#94a3b8" : `linear-gradient(135deg, ${orange}, #c94d1a)`, border: "none", borderRadius: 12, color: "#fff", fontSize: "0.95rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: loading ? "none" : "0 4px 16px rgba(232,98,42,0.35)", marginBottom: 14 }}>
            {loading ? "Αποστολή..." : "Αποστολή Μηνύματος"}
          </button>

          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
            Εναλλακτικά, επικοινωνήστε μαζί μας απευθείας στο{" "}
            <a href="mailto:info@taxiq.com.gr" style={{ color: orange, fontWeight: 600 }}>info@taxiq.com.gr</a>
          </p>
        </div>
      </div>
    </div>
  );
};

const CookiePolicyModal = ({ onClose }) => {
  const navy = "#1a2b5e";
  const orange = "#E8622A";
  const teal = "#5bb8c4";

  const Section = ({ num, title, children }) => (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "0.92rem", fontWeight: 800, color: navy, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: "rgba(26,43,94,0.07)", border: "1px solid rgba(26,43,94,0.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: navy, flexShrink: 0 }}>{num}</span>
        {title}
      </h3>
      <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.75, paddingLeft: 32 }}>{children}</div>
    </div>
  );

  const Bullet = ({ color = teal, children }) => (
    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
      <span style={{ color, flexShrink: 0, fontWeight: 700 }}>›</span>
      <span>{children}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#f8fafc", borderRadius: 24, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid rgba(26,43,94,0.08)", borderRadius: "24px 24px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: teal, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>Νομικά</div>
            <h2 style={{ color: navy, fontSize: "1.1rem", fontWeight: 900, margin: 0 }}>Πολιτική Cookies TaxIQ AI</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px 32px" }}>

          <Section num="1" title="Τι είναι τα Cookies;">
            Τα cookies είναι μικρά αρχεία κειμένου που αποθηκεύονται στον υπολογιστή ή την κινητή σας συσκευή όταν επισκέπτεστε το TaxIQ. Μας επιτρέπουν να "θυμόμαστε" τις ενέργειές σας και τις προτιμήσεις σας για ένα χρονικό διάστημα.
          </Section>

          <Section num="2" title="Ποια Cookies χρησιμοποιούμε;">
            <p style={{ margin: "0 0 12px" }}>Στο TaxIQ AI χρησιμοποιούμε τρεις κατηγορίες cookies:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Απαραίτητα:", color: orange, desc: "Είναι απαραίτητα για τη βασική λειτουργία του site. Σας επιτρέπουν να συνδέεστε στον λογαριασμό σας, να παραμένετε συνδεδεμένοι κατά την περιήγηση και να έχετε πρόσβαση στις συνδρομητικές υπηρεσίες. Χωρίς αυτά, η υπηρεσία δεν μπορεί να παρασχεθεί." },
                { label: "Λειτουργικά:", color: teal, desc: "Χρησιμοποιούνται για να σας αναγνωρίζουμε όταν επιστρέφετε στον ιστότοπο και να θυμόμαστε τις ρυθμίσεις σας (π.χ. επιλογή γλώσσας ή ρυθμίσεις εμφάνισης)." },
                { label: "Στατιστικά Στοιχεία & Βελτίωση:", color: navy, desc: "Χρησιμοποιούμε cookies (όπως Google Analytics) για να μετράμε πόσοι χρήστες μας επισκέπτονται και ποιες σελίδες χρησιμοποιούν περισσότερο. Αυτό μας βοηθά να βελτιώνουμε την ταχύτητα και την ποιότητα των απαντήσεων του AI. Τα δεδομένα αυτά συλλέγονται ανώνυμα." },
              ].map((item, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(26,43,94,0.08)" }}>
                  <div style={{ fontSize: "0.83rem", fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section num="3" title="Πώς μπορείτε να ελέγξετε τα Cookies;">
            <p style={{ margin: "0 0 10px" }}>Μπορείτε να αλλάξετε τις προτιμήσεις σας ανά πάσα στιγμή μέσω του εικονιδίου ρυθμίσεων στην ιστοσελίδα μας. Επίσης, μπορείτε να διαγράψετε όλα τα cookies που βρίσκονται ήδη στον υπολογιστή σας ρυθμίζοντας τον περιηγητή (browser) που χρησιμοποιείτε.</p>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderLeft: "4px solid #f59e0b", borderRadius: "0 8px 8px 0", padding: "10px 14px" }}>
              <p style={{ fontSize: "0.79rem", color: "#92400e", margin: 0, lineHeight: 1.6 }}>
                <strong>Σημείωση:</strong> Η απενεργοποίηση των "Απαραίτητων Cookies" θα καταστήσει αδύνατη τη σύνδεση στον λογαριασμό σας και τη χρήση της εφαρμογής.
              </p>
            </div>
          </Section>

          <Section num="4" title="Επικοινωνία">
            <p style={{ margin: "0 0 6px" }}>Για οποιαδήποτε απορία σχετικά με τη χρήση των cookies, μπορείτε να επικοινωνήσετε μαζί μας:</p>
            <a href="mailto:info@taxiq.com.gr" style={{ color: orange, fontWeight: 700, textDecoration: "none", fontSize: "0.88rem" }}>info@taxiq.com.gr</a>
          </Section>

        </div>
      </div>
    </div>
  );
};

const PrivacyModal = ({ onClose }) => {
  const navy = "#1a2b5e";
  const orange = "#E8622A";
  const teal = "#5bb8c4";

  const Section = ({ num, title, children }) => (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "0.92rem", fontWeight: 800, color: navy, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: "rgba(91,184,196,0.1)", border: "1px solid rgba(91,184,196,0.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: teal, flexShrink: 0 }}>{num}</span>
        {title}
      </h3>
      <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.75, paddingLeft: 32 }}>{children}</div>
    </div>
  );

  const Bullet = ({ children }) => (
    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
      <span style={{ color: teal, flexShrink: 0, fontWeight: 700 }}>›</span>
      <span>{children}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#f8fafc", borderRadius: 24, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid rgba(26,43,94,0.08)", borderRadius: "24px 24px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: teal, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>Νομικά</div>
            <h2 style={{ color: navy, fontSize: "1.1rem", fontWeight: 900, margin: 0 }}>Πολιτική Απορρήτου & Προστασίας Δεδομένων</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px 32px" }}>

          {/* Intro */}
          <div style={{ background: "rgba(91,184,196,0.06)", border: "1px solid rgba(91,184,196,0.2)", borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
            <p style={{ fontSize: "0.82rem", color: "#334155", lineHeight: 1.75, margin: 0 }}>
              Η παρούσα Πολιτική εξηγεί πώς το TaxIQ AI συλλέγει, χρησιμοποιεί και προστατεύει τα δεδομένα σας, διασφαλίζοντας την απόλυτη εχεμύθεια και τη συμμόρφωση με τον <strong style={{ color: navy }}>Γενικό Κανονισμό Προστασίας Δεδομένων (GDPR)</strong>.
            </p>
          </div>

          <Section num="1" title="Ποια δεδομένα συλλέγουμε;">
            <p style={{ margin: "0 0 10px" }}>Συλλέγουμε μόνο τα απαραίτητα δεδομένα για την παροχή των υπηρεσιών μας:</p>
            <Bullet><strong style={{ color: navy }}>Στοιχεία Λογαριασμού:</strong> Ονοματεπώνυμο και Email για την είσοδο και ταυτοποίηση στην πλατφόρμα.</Bullet>
            <Bullet><strong style={{ color: navy }}>Δεδομένα Χρέωσης:</strong> ΑΦΜ και στοιχεία τιμολόγησης για συνδρομητές ή για μεμονωμένες αγορές υπηρεσιών (On-demand ερωτήματα).</Bullet>
            <Bullet><strong style={{ color: navy }}>Ιστορικό Ερωτημάτων:</strong> Τα ερωτήματα που υποβάλλετε αποθηκεύονται με σκοπό τη βελτίωση των απαντήσεων, την παροχή υποστήριξης και τη δυνατότητα αναδρομής σας σε προηγούμενες απαντήσεις.</Bullet>
          </Section>

          <Section num="2" title="Πώς χρησιμοποιούμε τα δεδομένα σας;">
            <Bullet><strong style={{ color: navy }}>Παροχή Απαντήσεων:</strong> Επεξεργασία των ερωτημάτων μέσω του μοντέλου Τεχνητής Νοημοσύνης του TaxIQ AI AI.</Bullet>
            <Bullet><strong style={{ color: navy }}>Ανθρώπινη Επιβεβαίωση:</strong> Σε περίπτωση που ζητήσετε επικύρωση από την επιστημονική μας ομάδα (Λογιστές Α' Τάξης), οι ειδικοί μας αποκτούν πρόσβαση στο συγκεκριμένο ερώτημα για την αξιολόγησή του.</Bullet>
            <Bullet><strong style={{ color: navy }}>Επικοινωνία:</strong> Για ενημερώσεις σχετικά με τη συνδρομή σας, τεχνικά θέματα ή την έκδοση παραστατικών.</Bullet>
          </Section>

          <Section num="3" title="Ασφάλεια & Εχεμύθεια">
            <p style={{ margin: "0 0 10px" }}>Το TaxIQ AI εφαρμόζει αυστηρά πρωτόκολλα ασφαλείας:</p>
            <Bullet><strong style={{ color: navy }}>Κρυπτογράφηση:</strong> Τα δεδομένα μεταφέρονται και αποθηκεύονται με προηγμένες μεθόδους κρυπτογράφησης.</Bullet>
            <Bullet><strong style={{ color: navy }}>Ιδιωτικότητα AI:</strong> Τα ερωτήματά σας παραμένουν ιδιωτικά. Δεν χρησιμοποιούνται για την εκπαίδευση (training) δημόσιων μοντέλων AI τρίτων εταιρειών.</Bullet>
            <Bullet><strong style={{ color: navy }}>Μη Κοινοποίηση:</strong> Τα δεδομένα σας δεν πωλούνται και δεν κοινοποιούνται σε τρίτους για διαφημιστικούς σκοπούς. Η επεξεργασία γίνεται εντός της Ευρωπαϊκής Ένωσης.</Bullet>
          </Section>

          <Section num="4" title="Τα Δικαιώματά σας">
            <p style={{ margin: "0 0 10px" }}>Ως χρήστης, έχετε τον πλήρη έλεγχο των δεδομένων σας:</p>
            <Bullet><strong style={{ color: navy }}>Πρόσβαση & Διόρθωση:</strong> Δικαίωμα προβολής και επεξεργασίας των στοιχείων σας.</Bullet>
            <Bullet><strong style={{ color: navy }}>Διαγραφή:</strong> Δικαίωμα να ζητήσετε την οριστική διαγραφή του λογαριασμού και του ιστορικού σας.</Bullet>
            <Bullet><strong style={{ color: navy }}>Φορητότητα:</strong> Δικαίωμα να λάβετε τα δεδομένα σας σε δομημένη, ψηφιακή μορφή.</Bullet>
          </Section>

          <Section num="5" title="Επικοινωνία">
            <p style={{ margin: "0 0 8px" }}>Για οποιοδήποτε θέμα αφορά τα δεδομένα σας, επικοινωνήστε μαζί μας:</p>
            <a href="mailto:info@taxiq.com.gr" style={{ color: orange, fontWeight: 700, textDecoration: "none", fontSize: "0.88rem" }}>info@taxiq.com.gr</a>
          </Section>

        </div>
      </div>
    </div>
  );
};

const TermsModal = ({ onClose }) => {
  const navy = "#1a2b5e";
  const orange = "#E8622A";
  const teal = "#5bb8c4";

  const Section = ({ num, title, children }) => (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "0.92rem", fontWeight: 800, color: navy, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: "rgba(232,98,42,0.1)", border: "1px solid rgba(232,98,42,0.25)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: orange, flexShrink: 0 }}>{num}</span>
        {title}
      </h3>
      <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.75, paddingLeft: 32 }}>{children}</div>
    </div>
  );

  const Bullet = ({ children }) => (
    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
      <span style={{ color: orange, flexShrink: 0, fontWeight: 700 }}>›</span>
      <span>{children}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#f8fafc", borderRadius: 24, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid rgba(26,43,94,0.08)", borderRadius: "24px 24px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: teal, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>Νομικά</div>
            <h2 style={{ color: navy, fontSize: "1.1rem", fontWeight: 900, margin: 0 }}>Όροι Χρήσης TaxIQ AI</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px 32px" }}>

          {/* Important notice */}
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderLeft: "4px solid #f59e0b", borderRadius: "0 10px 10px 0", padding: "12px 16px", marginBottom: 24 }}>
            <p style={{ fontSize: "0.8rem", color: "#92400e", margin: 0, fontWeight: 600 }}>⚠️ Σημαντική Σημείωση</p>
            <p style={{ fontSize: "0.78rem", color: "#92400e", margin: "4px 0 0", lineHeight: 1.6 }}>Παρακαλούμε διαβάστε προσεκτικά τους όρους χρήσης πριν χρησιμοποιήσετε την υπηρεσία μας. Η χρήση του TaxIQ AI συνεπάγεται την πλήρη και ανεπιφύλακτη αποδοχή των παρόντων όρων.</p>
          </div>

          <Section num="1" title="Αποδοχή Όρων">
            Χρησιμοποιώντας την πλατφόρμα TaxIQ, συνιστά ανεπιφύλακτη και πλήρη αποδοχή των όρων χρήσεως, οι οποίοι ισχύουν για το σύνολο του περιεχομένου του. Σε περίπτωση διαφωνίας με τους όρους χρήσης, ο επισκέπτης/χρήστης οφείλει να εγκαταλείψει το διαδικτυακό τόπο και να μην προβεί σε περαιτέρω χρήση της Υπηρεσίας.
          </Section>

          <Section num="2" title="Περιγραφή Υπηρεσίας & Αποποίηση Ευθύνης (Disclaimer)">
            <p style={{ margin: "0 0 10px" }}>Το TaxIQ AI παρέχει πληροφόρηση σχετικά με την ελληνική φορολογική και λογιστική νομοθεσία μέσω τεχνολογίας Τεχνητής Νοημοσύνης (AI). Καταβάλλεται η μέγιστη δυνατή προσπάθεια, ώστε οι πληροφορίες να είναι ακριβείς, σαφείς, πλήρεις και επίκαιρες. Ωστόσο, ο χρήστης αναγνωρίζει και αποδέχεται τα εξής:</p>
            <Bullet><strong style={{ color: navy }}>Φύση Πληροφοριών:</strong> Το TaxIQ AI παρέχει αποκλειστικά ενημερωτικές πληροφορίες και όχι εξατομικευμένη λογιστική, φοροτεχνική ή νομική συμβουλή. Οι απαντήσεις του AI δεν υποκαθιστούν σε καμία περίπτωση την επαγγελματική κρίση ενός εξειδικευμένου συμβούλου.</Bullet>
            <Bullet><strong style={{ color: navy }}>Περιορισμός Ευθύνης:</strong> Σε καμία περίπτωση, συμπεριλαμβανομένης και αυτής της αμέλειας, δεν ευθύνεται για τυχόν λάθη, παραλείψεις ή ελλείψεις που αφορούν στις παραγόμενες πληροφορίες, για καθυστερήσεις, διακοπές ή αδυναμία μετάδοσης δεδομένων, ή για οποιαδήποτε ζημία προκληθεί στον επισκέπτη/χρήστη εξ αιτίας ή εξ αφορμής της χρήσης των πληροφοριών αυτών.</Bullet>
            <Bullet><strong style={{ color: navy }}>Παροχή «Ως Έχει»:</strong> Οι πληροφορίες και οι υπηρεσίες παρέχονται «ως έχουν», χωρίς καμία εγγύηση ρητή ή έμμεση.</Bullet>
            <Bullet><strong style={{ color: navy }}>Τελική Ευθύνη:</strong> Η τελική ευθύνη για οποιαδήποτε επιχειρηματική, λογιστική ή φορολογική ενέργεια βαρύνει αποκλειστικά τον χρήστη.</Bullet>
          </Section>

          <Section num="3" title="Εγγραφή & Πολιτική Ορθής Χρήσης">
            <Bullet><strong style={{ color: navy }}>Δικαίωμα Χρήσης:</strong> Η πρόσβαση παρέχεται αποκλειστικά σε φυσικά πρόσωπα που έχουν συμπληρώσει το 18ο έτος της ηλικίας τους.</Bullet>
            <Bullet><strong style={{ color: navy }}>Ατομικότητα Λογαριασμού:</strong> Η άδεια χρήσης είναι προσωπική και αμεταβίβαστη. Ο χρήστης φέρει την αποκλειστική ευθύνη για τη διαφύλαξη του απορρήτου των κωδικών πρόσβασης.</Bullet>
            <Bullet><strong style={{ color: navy }}>Περιορισμοί Χρήσης:</strong> Απαγορεύεται ρητά η οποιαδήποτε απόπειρα αντίστροφης μηχανικής (reverse engineering), η υποκλοπή πηγαίου κώδικα, καθώς και η χρήση αυτοματοποιημένων μέσων (bots/crawlers) χωρίς προηγούμενη γραπτή συγκατάθεση.</Bullet>
          </Section>

          <Section num="4" title="Τιμολόγηση & Πλάνα Πρόσβασης">
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 8 }}>
              {[
                { label: "Free Access:", items: ["Όριο Χρήσης: Έως 10 ερωτήματα ανά περίοδο 30 ημερών.", "Τεχνολογία: Απαντήσεις με AI & Web Search για real-time ενημέρωση νομοθεσίας.", "Τεκμηρίωση: Αναφορές σε νόμους, πηγές και δείκτης αξιοπιστίας απάντησης."] },
                { label: "Professional Plan:", items: ["Όριο Χρήσης: Έως 80 εξειδικευμένες αναζητήσεις ανά περίοδο 30 ημερών.", "Τεχνολογία & Τεκμηρίωση: AI & Web Search, Real-Time νομοθεσία, αναφορές και δείκτης αξιοπιστίας.", "Προτεραιότητα: Ταχύτερη επεξεργασία και προτεραιότητα απόκρισης.", "Εξειδικευμένο Περιεχόμενο: Πρόσβαση σε βιβλιοθήκη εγκυκλίων."] },
                { label: "Business Plan:", items: ["Απεριόριστες Εξειδικευμένες Αναζητήσεις (Πολιτική Ορθής Χρήσης).", "Τεχνολογία & Τεκμηρίωση: AI & Web Search, Real-Time νομοθεσία, αναφορές και δείκτης αξιοπιστίας.", "Προτεραιότητα: Ταχύτερη επεξεργασία και προτεραιότητα απόκρισης.", "Back-office από Λογιστές Α' Τάξης: Επιστημονική υποστήριξη υψηλού επιπέδου.", "Πλήρης πρόσβαση σε βιβλιοθήκη εγκυκλίων και εξειδικευμένων φορολογικών εγγράφων.", "Dedicated Email & Direct Line για προτεραιότητα στην εξυπηρέτηση.", "Προνομιακή πρόσβαση στο κλειστό δίκτυο στρατηγικών συνεργατών.", "Αυστηρό πρωτόκολλο επαγγελματικού απορρήτου."] },
              ].map((plan, i) => (
                <div key={i} style={{ background: "rgba(26,43,94,0.03)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 800, color: navy, marginBottom: 8 }}>{plan.label}</div>
                  {plan.items.map((item, j) => <Bullet key={j}>{item}</Bullet>)}
                </div>
              ))}
            </div>
            <p style={{ margin: "8px 0 0", fontStyle: "italic", fontSize: "0.79rem" }}>Τα όρια ερωτήσεων και οι τιμές ενδέχεται να τροποποιούνται με προηγούμενη ενημέρωση των χρηστών.</p>
          </Section>

          <Section num="5" title="Διαδικασία Χρέωσης & Ανανέωσης">
            <Bullet><strong style={{ color: navy }}>Περίοδος Χρέωσης:</strong> Η συνδρομή στα πλάνα Professional και Business έχει διάρκεια τριάντα (30) ημερολογιακών ημερών από την ημερομηνία ενεργοποίησης και εξοφλείται προκαταβολικά.</Bullet>
            <Bullet><strong style={{ color: navy }}>Αυτόματη Ανανέωση:</strong> Οι συνδρομές ανανεώνονται αυτόματα στο τέλος κάθε περιόδου. Ο χρήστης μπορεί να ακυρώσει τουλάχιστον 24 ώρες πριν την επόμενη χρέωση.</Bullet>
            <Bullet><strong style={{ color: navy }}>Εξατομικευμένες Συμφωνίες (B2B):</strong> Για το Business Plan, το TaxIQ AI δύναται να προβεί σε ειδικές τιμολογήσεις κατόπιν έγγραφης συμφωνίας (SLA). Οι όροι της έγγραφης συμφωνίας υπερισχύουν των γενικών όρων.</Bullet>
          </Section>

          <Section num="6" title="Πολιτική Χρήσης Ορίων & Επιστροφών">
            <Bullet><strong style={{ color: navy }}>Μη Μεταφορά Υπολοίπου:</strong> Τα όρια ερωτημάτων αφορούν αποκλειστικά την τρέχουσα περίοδο χρέωσης (30 ημέρες). Αχρησιμοποίητο υπόλοιπο μηδενίζεται με τη λήξη και δεν μεταφέρεται.</Bullet>
            <Bullet><strong style={{ color: navy }}>Δικαίωμα Ακύρωσης:</strong> Ο χρήστης μπορεί να διακόψει τη συνδρομή ανά πάσα στιγμή. Η πρόσβαση παραμένει ενεργή μέχρι τη λήξη της εξοφλημένης περιόδου.</Bullet>
            <Bullet><strong style={{ color: navy }}>Μη Επιστροφή Χρημάτων:</strong> Λόγω της φύσης του ψηφιακού περιεχομένου, δεν παρέχονται επιστροφές χρημάτων για μερικώς χρησιμοποιημένες περιόδους.</Bullet>
          </Section>

          <Section num="7" title="Περιορισμός Ευθύνης & Αποποίηση Εγγυήσεων">
            <Bullet><strong style={{ color: navy }}>Φύση Περιεχομένου:</strong> Το περιεχόμενο και οι απαντήσεις του TaxIQ AI έχουν καθαρά ενημερωτικό χαρακτήρα. Σε καμία περίπτωση δεν αποτελούν, ευθέως ή εμμέσως, παρότρυνση, συμβουλή ή προτροπή για τη διενέργεια οποιασδήποτε επενδυτικής, φορολογικής ή άλλης πράξης με οικονομικό αποτέλεσμα. Εναπόκειται στη διακριτική ευχέρεια των χρηστών να αξιολογήσουν τις παρεχόμενες πληροφορίες και να ενεργήσουν βασιζόμενοι στην ιδιωτική τους βούληση, αποκλειόμενης οποιασδήποτε ευθύνης.</Bullet>
            <Bullet><strong style={{ color: navy }}>Τεχνική Λειτουργία:</strong> Το TaxIQ AI δεν εγγυάται την αδιάκοπη και άνευ λαθών παροχή των υπηρεσιών, ούτε την πλήρη απουσία κακόβουλου λογισμικού («ιών»), είτε στην Πλατφόρμα είτε στους διακομιστές (servers) μέσω των οποίων λαμβάνεται το περιεχόμενο. Έχουμε λάβει όλα τα απαραίτητα μέτρα για τη διαφύλαξη της ασφάλειας και του απορρήτου, ωστόσο δεν φέρουμε ευθύνη αν, παρά την άσκηση της δέουσας επιμέλειας, παραβιασθεί το απόρρητο των πληροφοριών αυτών.</Bullet>
            <Bullet><strong style={{ color: navy }}>Αποποίηση Ζημιών:</strong> Οι δημιουργοί δεν ευθύνονται για τυχόν αποθετικές ζημίες ή διαφυγόντα κέρδη, άμεση ή έμμεση ζημία που προκύπτει από τη χρήση ή την αδυναμία χρήσης της Πλατφόρμας καθώς και ανακρίβειες στις απαντήσεις του AI λόγω αστοχίας του μοντέλου (hallucinations), ελλιπούς βάσης δεδομένων ή αιφνίδιας αλλαγής της νομοθεσίας ή βλάβες από ανωτέρα βία.</Bullet>
            <Bullet><strong style={{ color: navy }}>Παροχή «Ως Έχει»:</strong> Το σύνολο των πληροφοριών και υπηρεσιών παρέχεται «ως έχει», χωρίς καμία εγγύηση ρητή ή έμμεση περί εμπορευσιμότητας ή καταλληλότητας για συγκεκριμένο σκοπό.</Bullet>
          </Section>

          <Section num="8" title="Πνευματική Ιδιοκτησία">
            <p style={{ margin: "0 0 8px" }}>Με την επιφύλαξη δικαιωμάτων τρίτων, όλο το περιεχόμενο του TaxIQ AI (αλγόριθμος, σήματα, κείμενα, υπηρεσίες) αποτελεί πνευματική και βιομηχανική ιδιοκτησία και διέπεται από ελληνικές, ευρωπαϊκές και διεθνείς διατάξεις. Απαγορεύεται οποιαδήποτε τροποποίηση, δημοσίευση, μετάδοση, αναπαραγωγή ή εκμετάλλευση με οποιονδήποτε τρόπο ή μέσο για εμπορικούς ή άλλους σκοπούς, χωρίς προηγούμενη έγγραφη άδεια.</p>
            <Bullet><strong style={{ color: navy }}>Εξαίρεση:</strong> Ο χρήστης διατηρεί δικαίωμα αποθήκευσης, εκτύπωσης και κοινοποίησης απαντήσεων για προσωπική ή επαγγελματική χρήση, υπό την προϋπόθεση ότι δεν συνιστά εμπορική μεταπώληση της υπηρεσίας.</Bullet>
          </Section>

          <Section num="9" title="Αναστολή & Τερματισμός Υπηρεσιών">
            <p style={{ margin: "0 0 8px" }}>Το TaxIQ AI διατηρεί το δικαίωμα αναστολής ή τερματισμού πρόσβασης χωρίς προηγούμενη ειδοποίηση σε περιπτώσεις:</p>
            <Bullet><strong style={{ color: navy }}>Παραβίαση Όρων:</strong> Οποιαδήποτε παράβαση των παρόντων Όρων Χρήσης, Πολιτικής Απορρήτου ή εχεμύθειας.</Bullet>
            <Bullet><strong style={{ color: navy }}>Κακόβουλη Χρήση:</strong> Απόπειρα παρέμβασης στο λογισμικό, χρήση bots ή υποκλοπή κώδικα.</Bullet>
            <Bullet><strong style={{ color: navy }}>Μη Εξουσιοδοτημένη Μεταπώληση:</strong> Χρήση με σκοπό την απευθείας μεταπώληση των παραγόμενων απαντήσεων ως αυτόνομη υπηρεσία σε τρίτους, χωρίς έγγραφη άδεια.</Bullet>
            <Bullet><strong style={{ color: navy }}>Προσβολή Φήμης:</strong> Ενέργειες δυσφήμισης της Πλατφόρμας ή των δημιουργών της.</Bullet>
            <Bullet><strong style={{ color: navy }}>Οικονομική Εκκρεμότητα:</strong> Μη έγκαιρη εξόφληση συνδρομής ή αμφισβήτηση νόμιμων πληρωμών.</Bullet>
            <p style={{ margin: "10px 0 0", fontStyle: "italic" }}>Σε περίπτωση τερματισμού για τους παραπάνω λόγους, ο χρήστης αποδέχεται ότι δεν δικαιούται καμία αποζημίωση για το υπόλοιπο της συνδρομής του.</p>
          </Section>

          <Section num="10" title="Τροποποίηση Όρων & Εφαρμοστέο Δίκαιο">
            <Bullet><strong style={{ color: navy }}>Δικαίωμα Τροποποίησης:</strong> Το TaxIQ AI διατηρεί το δικαίωμα να τροποποιεί ή να ανανεώνει τους παρόντες Όρους Χρήσης ανά πάσα στιγμή, προκειμένου να εναρμονίζονται με τις νέες τεχνολογικές εξελίξεις, τις αλλαγές στη νομοθεσία ή τη βελτίωση των υπηρεσιών του. Οι τροποποιήσεις τίθενται σε ισχύ αμέσως μετά τη δημοσίευσή τους. Η συνεχιζόμενη χρήση μετά από αλλαγή συνιστά ανεπιφύλακτη αποδοχή των νέων όρων.</Bullet>
            <Bullet><strong style={{ color: navy }}>Εφαρμοστέο Δίκαιο:</strong> Οι παρόντες όροι διέπονται από το Ελληνικό Δίκαιο, το δίκαιο της Ευρωπαϊκής Ένωσης και τις σχετικές διεθνείς συνθήκες.</Bullet>
            <Bullet><strong style={{ color: navy }}>Αρμοδιότητα Δικαστηρίων:</strong> Για οποιαδήποτε διαφορά προκύψει σχετικά με την ερμηνεία ή την εφαρμογή των παρόντων όρων ή τη χρήση της Πλατφόρμας, αποκλειστικά αρμόδια ορίζονται τα Δικαστήρια της έδρας της επιχείρησης, παραιτουμένου του χρήστη από οποιαδήποτε άλλη δωσιδικία.</Bullet>
          </Section>

          <Section num="11" title="Επικοινωνία & Υποστήριξη">
            <p style={{ margin: "0 0 8px" }}>Για διευκρινίσεις, τεχνική υποστήριξη ή υποβολή αιτήματος συνεργασίας (Business Plan) επικοινωνήστε μαζί μας:</p>
            <Bullet>Email: <a href="mailto:info@taxiq.com.gr" style={{ color: orange, fontWeight: 600, textDecoration: "none" }}>info@taxiq.com.gr</a></Bullet>
            <Bullet>Website: <a href="https://taxiq.com.gr" target="_blank" rel="noopener noreferrer" style={{ color: orange, fontWeight: 600, textDecoration: "none" }}>taxiq.com.gr</a></Bullet>
          </Section>

        </div>
      </div>
    </div>
  );
};


const FAQModal = ({ onClose }) => {
  const navy = "#1a2b5e";
  const teal = "#5bb8c4";
  const orange = "#E8622A";
  const [openIndex, setOpenIndex] = React.useState(null);

  const faqs = [
    {
      q: "Πόσο ενημερωμένες είναι οι απαντήσεις που δίνει ο βοηθός;",
      a: "Το TaxIQ AI λειτουργεί με τεχνολογία Real-Time Indexing. Σε αντίθεση με τα κοινά μοντέλα AI που έχουν περιορισμένη γνώση μέχρι μια συγκεκριμένη ημερομηνία, η πλατφόρμα μας σαρώνει και αναλύει ενεργά ΦΕΚ, εγκυκλίους και αποφάσεις της ΑΑΔΕ που δημοσιεύθηκαν ακόμη και σήμερα. Έτσι, έχετε πάντα την τελευταία λέξη του νόμου στην οθόνη σας."
    },
    {
      q: "Από ποιες πηγές αντλεί τα δεδομένα του ο AI βοηθός;",
      a: null,
      list: [
        { label: "Επίσημα Αρχεία & Φορείς:", text: "ΑΑΔΕ, ΦΕΚ, ΠΣ ΕΡΓΑΝΗ & ΔΥΠΑ (πρώην ΟΑΕΔ)." },
        { label: "Επιχειρηματικότητα:", text: "ΓΕΜΗ, Επιμελητήρια & Προγράμματα ΕΣΠΑ." },
        { label: "Βάσεις Δεδομένων:", text: "Εξειδικευμένα λογιστικά portals." },
        { label: "Πρότυπα:", text: "Ελληνικά & Διεθνή Λογιστικά Πρότυπα." },
        { label: "Νομοθεσία:", text: "Κωδικοποιημένη Νομοθεσία (ΚΦΕ, ΚΦΔ, ΦΠΑ) και Ευρωπαϊκές Οδηγίες." },
      ],
      note: "Η λίστα των πηγών μας εμπλουτίζεται συνεχώς για να καλύπτει κάθε νέα ανάγκη της ελληνικής επιχειρηματικότητας."
    },
    {
      q: "Μπορώ να βασιστώ στις απαντήσεις για τη φορολογική μου δήλωση;",
      a: "Το TaxIQ AI είναι ένας ισχυρός ψηφιακός σύμβουλος υποστήριξης και παρέχει τεκμηριωμένη πληροφόρηση. Ωστόσο, οι απαντήσεις έχουν συμβουλευτικό χαρακτήρα και δεν υποκαθιστούν την τελική κρίση ενός πιστοποιημένου λογιστή. Για κρίσιμες υποβολές, συνιστάται πάντα η επιβεβαίωση από τον επαγγελματία συνεργάτη σας."
    },
    {
      q: "Είναι ασφαλή τα δεδομένα και οι ερωτήσεις μου;",
      a: "Απόλυτα. Χρησιμοποιούμε πρωτόκολλα κρυπτογράφησης δεδομένων. Τα ερωτήματά σας παραμένουν ιδιωτικά και δεν χρησιμοποιούνται για την εκπαίδευση δημόσιων μοντέλων AI τρίτων εταιρειών ούτε κοινοποιούνται σε τρίτους. Η ιδιωτικότητά σας είναι προτεραιότητά μας."
    },
    {
      q: "Πώς μπορώ να επαληθεύσω μια απάντηση;",
      a: "Σε κάθε απάντηση, ο AI βοηθός παραθέτει τις πηγές και τους συνδέσμους (links) από όπου άντλησε τις πληροφορίες, ώστε να μπορείτε να διαβάσετε το πρωτότυπο κείμενο της εγκυκλίου ή του νόμου."
    },
    {
      q: "Τι γίνεται αν χρειάζομαι τη βοήθεια ενός ειδικού;",
      a: null,
      expert: true
    },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 560, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 24px 18px", borderBottom: "1px solid rgba(26,43,94,0.08)", flexShrink: 0 }}>
          <div>
            <h2 style={{ color: navy, fontSize: "1.2rem", fontWeight: 900, margin: 0 }}>Συχνές Ερωτήσεις</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        {/* Accordion */}
        <div style={{ overflowY: "auto", padding: "12px 0" }}>
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} style={{ borderBottom: "1px solid rgba(26,43,94,0.07)", margin: "0 24px" }}>
                {/* Question row */}
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 0", fontFamily: "inherit", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: isOpen ? `rgba(232,98,42,0.1)` : "rgba(26,43,94,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 800, color: isOpen ? orange : navy }}>{i + 1}</span>
                    </div>
                    <span style={{ fontSize: "0.9rem", fontWeight: 700, color: isOpen ? orange : navy, lineHeight: 1.4, transition: "color 0.2s" }}>{faq.q}</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transition: "transform 0.25s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <path d="M6 9l6 6 6-6" stroke={isOpen ? orange : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Answer */}
                {isOpen && (
                  <div style={{ paddingBottom: 16, paddingLeft: 38 }}>
                    {faq.a && (
                      <p style={{ fontSize: "0.84rem", color: "#475569", lineHeight: 1.7, margin: "0 0 0" }}>{faq.a}</p>
                    )}
                    {faq.expert && (
                      <div>
                        <p style={{ fontSize: "0.84rem", color: "#475569", lineHeight: 1.7, margin: "0 0 12px" }}>
                          Είμαστε δίπλα σας. Αν και το TaxIQ AI είναι εξαιρετικά ακριβές, κατανοούμε ότι ορισμένα θέματα απαιτούν εξατομικευμένη προσέγγιση και επιβεβαίωση από ειδικό επαγγελματία.
                        </p>
                        <p style={{ fontSize: "0.84rem", color: "#475569", lineHeight: 1.7, margin: "0 0 10px" }}>
                          Για τον λόγο αυτό, σας προσφέρουμε τη δυνατότητα επιβεβαίωσης της απάντησης από την επιστημονική μας ομάδα:
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <span style={{ color: orange, fontWeight: 700, flexShrink: 0 }}>›</span>
                            <span style={{ fontSize: "0.82rem", color: "#475569" }}><strong style={{ color: navy }}>Για Συνδρομητές:</strong> Η υπηρεσία περιλαμβάνεται ήδη σε συγκεκριμένα πακέτα (Business).</span>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <span style={{ color: orange, fontWeight: 700, flexShrink: 0 }}>›</span>
                            <span style={{ fontSize: "0.82rem", color: "#475569" }}><strong style={{ color: navy }}>Για όλους τους χρήστες:</strong> Μπορείτε να ζητήσετε την επικύρωση οποιασδήποτε απάντησης μεμονωμένα (on-demand), με μια μικρή επιπλέον χρέωση.</span>
                          </div>
                        </div>
                        <div style={{ background: "rgba(26,43,94,0.04)", border: "1px solid rgba(26,43,94,0.1)", borderRadius: 10, padding: "12px 14px" }}>
                          <p style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.65, margin: 0 }}>
                            Έμπειροι <strong style={{ color: navy }}>Λογιστές Α' Τάξης με 30ετή εμπειρία</strong> (από το 1994) εξετάζουν το ερώτημά σας, συνδυάζοντας την ταχύτητα της Τεχνητής Νοημοσύνης με την εγγύηση της ανθρώπινης υπογραφής.
                          </p>
                        </div>
                      </div>
                    )}
                    {faq.list && (
                      <div>
                        <p style={{ fontSize: "0.84rem", color: "#475569", lineHeight: 1.7, margin: "0 0 10px" }}>
                          Ο βοηθός βασίζεται αποκλειστικά στην αξιόπιστη αναζήτηση και ανάλυση δεδομένων σε πραγματικό χρόνο από επίσημες πηγές, αποφεύγοντας τυχαία άρθρα του διαδικτύου. Συγκεκριμένα, σαρώνει:
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {faq.list.map((item, j) => (
                            <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <span style={{ color: orange, fontWeight: 700, flexShrink: 0, fontSize: "0.82rem", marginTop: 1 }}>›</span>
                              <p style={{ fontSize: "0.82rem", color: "#475569", margin: 0, lineHeight: 1.55 }}>
                                <strong style={{ color: navy }}>{item.label}</strong> {item.text}
                              </p>
                            </div>
                          ))}
                        </div>
                        {faq.note && (
                          <p style={{ fontSize: "0.78rem", color: teal, fontStyle: "italic", marginTop: 12, marginBottom: 0, paddingLeft: 4, borderLeft: `2px solid ${teal}`, lineHeight: 1.55 }}>
                            "{faq.note}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(26,43,94,0.08)", flexShrink: 0, background: "rgba(26,43,94,0.02)" }}>
          <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0, textAlign: "center" }}>
            Δεν βρήκατε απάντηση; <a href="mailto:info@taxiq.com.gr" style={{ color: orange, fontWeight: 600, textDecoration: "none" }}>Επικοινωνήστε μαζί μας</a>
          </p>
        </div>
      </div>
    </div>
  );
};

const CookieBanner = ({ onAccept, onReject, onCustomize }) => (
  <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 3000, background: "#fff", borderTop: "1px solid rgba(26,43,94,0.12)", boxShadow: "0 -4px 24px rgba(0,0,0,0.1)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 260 }}>
      <div style={{ fontSize: "1.4rem", flexShrink: 0, marginTop: 1 }}>🍪</div>
      <div>
        <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#1a2b5e", marginBottom: 3 }}>Cookies στο TaxIQ</div>
        <p style={{ fontSize: "0.78rem", color: "#64748b", margin: 0, lineHeight: 1.55 }}>
          Χρησιμοποιούμε cookies για να διασφαλίσουμε τη σωστή λειτουργία της πλατφόρμας, να βελτιώσουμε την εμπειρία σας και να αναλύουμε την επισκεψιμότητα, ώστε να γινόμαστε καλύτεροι.{" "}
          <a href="#" onClick={e => { e.preventDefault(); setShowCookiePolicy(true); }} style={{ color: "#5bb8c4", fontWeight: 600, textDecoration: "none" }}
            onMouseEnter={e => e.target.style.textDecoration = "underline"}
            onMouseLeave={e => e.target.style.textDecoration = "none"}>
            Πολιτική Cookies
          </a>
        </p>
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <button onClick={onCustomize}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid rgba(26,43,94,0.2)", borderRadius: 8, padding: "8px 14px", color: "#1a2b5e", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#1a2b5e"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(26,43,94,0.2)"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="#1a2b5e" strokeWidth="2"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="#1a2b5e" strokeWidth="2" strokeLinecap="round"/></svg>
        Προσαρμογή
      </button>
      <button onClick={onReject}
        style={{ background: "none", border: "1px solid rgba(26,43,94,0.2)", borderRadius: 8, padding: "8px 14px", color: "#1a2b5e", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#1a2b5e"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(26,43,94,0.2)"}>
        Απόρριψη
      </button>
      <button onClick={onAccept}
        style={{ background: "#1a2b5e", border: "none", borderRadius: 8, padding: "8px 18px", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "background 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.background = "#0f1c3f"}
        onMouseLeave={e => e.currentTarget.style.background = "#1a2b5e"}>
        Αποδοχή Όλων
      </button>
    </div>
  </div>
);

const CookieCustomizeModal = ({ onSave, onClose }) => {
  const navy = "#1a2b5e";
  const teal = "#5bb8c4";
  const [analytics, setAnalytics] = React.useState(true);
  const [functional, setFunctional] = React.useState(true);

  const Toggle = ({ value, onChange, label, desc, locked }) => (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "14px 0", borderBottom: "1px solid rgba(26,43,94,0.07)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: "0.88rem", fontWeight: 700, color: navy }}>{label}</span>
          {locked && <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#fff", background: teal, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.05em" }}>ΠΑΝΤΑ ΕΝΕΡΓΟ</span>}
        </div>
        <p style={{ fontSize: "0.77rem", color: "#64748b", margin: 0, lineHeight: 1.55 }}>{desc}</p>
      </div>
      <div
        onClick={() => !locked && onChange(!value)}
        style={{ width: 44, height: 24, borderRadius: 12, background: (locked || value) ? navy : "#e2e8f0", cursor: locked ? "default" : "pointer", position: "relative", flexShrink: 0, transition: "background 0.25s", marginTop: 2 }}>
        <div style={{ position: "absolute", top: 3, left: (locked || value) ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.25s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000, padding: 16, backdropFilter: "blur(4px)" }} onClick={() => onClose()}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px 16px", borderBottom: "1px solid rgba(26,43,94,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.3rem" }}>🍪</span>
            <h2 style={{ color: navy, fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>Προτιμήσεις Cookies</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "4px 22px 20px" }}>
          <p style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: 1.6, marginBottom: 4 }}>
            Επιλέξτε ποιες κατηγορίες cookies αποδέχεστε. Τα απαραίτητα cookies δεν μπορούν να απενεργοποιηθούν καθώς είναι αναγκαία για τη λειτουργία της υπηρεσίας.
          </p>

          <Toggle
            locked={true}
            value={true}
            onChange={() => {}}
            label="Απαραίτητα"
            desc="Απαιτούνται για τη σύνδεση, την ασφάλεια και τις βασικές λειτουργίες της εφαρμογής. Δεν μπορούν να απενεργοποιηθούν."
          />
          <Toggle
            value={functional}
            onChange={setFunctional}
            label="Λειτουργικά"
            desc="Αποθηκεύουν τις προτιμήσεις σας (π.χ. γλώσσα, ρυθμίσεις) για καλύτερη εμπειρία χρήσης."
          />
          <Toggle
            value={analytics}
            onChange={setAnalytics}
            label="Στατιστικά Στοιχεία & Βελτίωση"
            desc="Μας βοηθούν να κατανοήσουμε πώς χρησιμοποιείται η εφαρμογή, ώστε να τη βελτιώνουμε συνεχώς για εσάς."
          />
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "14px 22px 20px", borderTop: "1px solid rgba(26,43,94,0.08)" }}>
          <button
            onClick={() => onSave({ analytics, functional })}
            style={{ flex: 1, padding: "12px", background: `linear-gradient(135deg, #1a2b5e, #0f1c3f)`, border: "none", borderRadius: 10, color: "#fff", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Αποθήκευση Επιλογών
          </button>
          <button
            onClick={() => onSave({ analytics: true, functional: true })}
            style={{ flex: 1, padding: "12px", background: `linear-gradient(135deg, #E8622A, #c94d1a)`, border: "none", borderRadius: 10, color: "#fff", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Αποδοχή Όλων
          </button>
        </div>
      </div>
    </div>
  );
};

const PricingPage = ({ onClose, user, onSignup }) => {
  const navy = "#1a2b5e";
  const orange = "#E8622A";
  const teal = "#5bb8c4";

  const freeFeatures = [
    "Έως 10 ερωτήσεις",
    "Απαντήσεις με AI & Web Search",
    "Real-Time ενημέρωση νομοθεσίας",
    "Αναφορές σε νόμους & πηγές",
    "Δείκτης αξιοπιστίας απάντησης",
  ];

  const proFeatures = [
    "80 ερωτήσεις / μήνα",
    "Απαντήσεις με AI & Web Search",
    "Real-Time ενημέρωση νομοθεσίας",
    "Αναφορές σε νόμους & πηγές",
    "Δείκτης αξιοπιστίας απάντησης",
    "Προτεραιότητα στις απαντήσεις",
    "Πρόσβαση σε εξειδικευμένη βιβλιοθήκη εγκυκλίων",
  ];

  const FeatureList = ({ features, color }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
      {features.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${color}18`, border: `1.5px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ color: "#1e293b", fontSize: "0.84rem", fontWeight: 500 }}>{f}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#f8fafc", borderRadius: 24, width: "100%", maxWidth: 940, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", position: "relative", overflow: "hidden", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, ${orange}, ${teal})` }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 24px 16px", background: "#fff", borderBottom: "1px solid rgba(26,43,94,0.08)" }}>
          <h2 style={{ color: navy, fontSize: "1.15rem", fontWeight: 900, margin: 0 }}>Επιλέξτε το Πλάνο που σας Ταιριάζει</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>✕</button>
        </div>

        {/* Three-column plans */}
        <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, padding: "20px 16px 24px" }}>

          {/* FREE PLAN */}
          <div style={{ background: "#fff", borderRadius: 18, padding: "22px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.07)", border: "1.5px solid rgba(232,98,42,0.2)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(232,98,42,0.08)", border: "1.5px solid rgba(232,98,42,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l2.4 4.9 5.6.8-4 3.9.9 5.4L12 14.5l-4.9 2.5.9-5.4L4 7.7l5.6-.8L12 2z" stroke={orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="rgba(232,98,42,0.1)"/>
                </svg>
              </div>
              <div style={{ minHeight: 52 }}>
                <div style={{ fontSize: "1.15rem", fontWeight: 900, color: navy }}>Free</div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", lineHeight: 1.4 }}>Βασική ψηφιακή υποστήριξη με τη δύναμη του AI.</div>
              </div>
            </div>
            <div style={{ minHeight: 44, display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
              <span style={{ fontSize: "2rem", fontWeight: 900, color: navy }}>€0</span>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>/ μήνα</span>
            </div>
            <div style={{ height: 1, background: "rgba(26,43,94,0.08)", marginBottom: 16 }} />
            <FeatureList features={freeFeatures} color={teal} />
            <button
              onClick={() => user ? onClose() : onSignup()}
              style={{ width: "100%", padding: "12px", background: user ? "rgba(26,43,94,0.06)" : `linear-gradient(135deg, ${orange}, #c94d1a)`, border: user ? "1.5px solid rgba(26,43,94,0.15)" : "none", borderRadius: 12, color: user ? navy : "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: user ? "default" : "pointer", fontFamily: "inherit", boxShadow: user ? "none" : "0 4px 14px rgba(232,98,42,0.35)", transition: "all 0.2s" }}
              onMouseEnter={e => { if (!user) e.currentTarget.style.background = "#c94d1a"; }}
              onMouseLeave={e => { if (!user) e.currentTarget.style.background = `linear-gradient(135deg, ${orange}, #c94d1a)`; }}
            >
              {user ? "✓ Ενεργό" : "🎉 Ξεκινήστε Δωρεάν"}
            </button>
            {!user && <p style={{ fontSize: "0.65rem", color: "#94a3b8", textAlign: "center", marginTop: 6, marginBottom: 0 }}>Δεν απαιτείται πιστωτική κάρτα</p>}
          </div>

          {/* PROFESSIONAL PLAN */}
          <div style={{ background: `linear-gradient(160deg, ${navy} 0%, #1e3a7a 100%)`, borderRadius: 18, padding: "22px 20px", boxShadow: "0 4px 20px rgba(26,43,94,0.3)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Badge */}
            <div style={{ position: "absolute", top: 14, right: 14, background: teal, borderRadius: 20, padding: "3px 10px", fontSize: "0.6rem", fontWeight: 700, color: "#fff", letterSpacing: "0.08em" }}>ΣΎΝΤΟΜΑ</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(91,184,196,0.15)", border: `1.5px solid ${teal}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke={teal} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="rgba(91,184,196,0.1)"/>
                </svg>
              </div>
              <div style={{ minHeight: 52 }}>
                <div style={{ fontSize: "1.15rem", fontWeight: 900, color: "#fff" }}>Professional</div>
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>Ολοκληρωμένη υποστήριξη για Επιχειρήσεις και απαιτητικούς χρήστες.</div>
              </div>
            </div>
            <div style={{ minHeight: 44, display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
              <span style={{ fontSize: "1.4rem", fontWeight: 900, color: teal }}>Σύντομα Διαθέσιμο</span>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", marginBottom: 16 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
              {proFeatures.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(91,184,196,0.15)", border: `1.5px solid ${teal}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.84rem", fontWeight: 500 }}>{f}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { onClose(); }}
              style={{ width: "100%", padding: "12px", background: `rgba(91,184,196,0.15)`, border: `1.5px solid ${teal}`, borderRadius: 12, color: teal, fontSize: "0.9rem", fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit", transition: "all 0.2s", opacity: 0.8 }}
            >
              Αποκτήστε Πρόσβαση
            </button>
            <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", textAlign: "center", marginTop: 6, marginBottom: 0 }}>Σύντομα διαθέσιμο</p>
          </div>

          {/* BUSINESS PLAN */}
          <div style={{ background: "linear-gradient(160deg, #0f1c3f 0%, #1a2b5e 100%)", borderRadius: 18, padding: "22px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", position: "relative", overflow: "hidden", border: "1.5px solid rgba(232,98,42,0.3)", display: "flex", flexDirection: "column" }}>
            {/* Badge */}
            <div style={{ position: "absolute", top: 14, right: 14, background: orange, borderRadius: 20, padding: "3px 10px", fontSize: "0.6rem", fontWeight: 700, color: "#fff", letterSpacing: "0.08em" }}>B2B</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(232,98,42,0.15)", border: "1.5px solid rgba(232,98,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="rgba(232,98,42,0.1)"/>
                  <path d="M9 22V12h6v10" stroke={orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ minHeight: 52 }}>
                <div style={{ fontSize: "1.15rem", fontWeight: 900, color: "#fff" }}>Business</div>
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>Εξειδικευμένη B2B υποστήριξη υψηλού επιπέδου με αυστηρό πρωτόκολλο επαγγελματικού απορρήτου.</div>
              </div>
            </div>
            <div style={{ minHeight: 44, display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: orange }}>Κατόπιν Συνεννόησης</span>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
              {[
                "Απεριόριστες ερωτήσεις",
                "Απαντήσεις με AI & Web Search",
                "Real-Time ενημέρωση νομοθεσίας",
                "Αναφορές σε νόμους & πηγές",
                "Δείκτης αξιοπιστίας απάντησης",
                "Προτεραιότητα στις απαντήσεις",
                "Βιβλιοθήκη εξειδικευμένων εγκυκλίων",
                "Back-office από Λογιστές Α' Τάξης",
                "Dedicated Email & Direct Line",
                "Πρόσβαση στο δίκτυο συνεργατών TaxIQ",
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(232,98,42,0.15)", border: "1.5px solid rgba(232,98,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.82)", fontSize: "0.82rem", fontWeight: 500 }}>{f}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { onClose(); window.location.href = "mailto:info@taxiq.com.gr?subject=Αίτημα Συνεργασίας Business Plan"; }}
              style={{ width: "100%", padding: "12px", background: `linear-gradient(135deg, ${orange}, #c94d1a)`, border: "none", borderRadius: 12, color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(232,98,42,0.4)", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#c94d1a"}
              onMouseLeave={e => e.currentTarget.style.background = `linear-gradient(135deg, ${orange}, #c94d1a)`}
            >
              Αίτημα Συνεργασίας
            </button>
            <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 6, marginBottom: 0 }}>info@taxiq.com.gr</p>
          </div>

        </div>
      </div>
    </div>
  );
};

const AuthModal = ({ onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthSuccess(data.user);
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        // Notify admin
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, type: "signup", notifyEmails: ["info@taxiq.com.gr", "dachris78@gmail.com"] })
        }).catch(() => {});
        setMessage("✅ Σας στάλθηκε email επιβεβαίωσης! Ελέγξτε τα εισερχόμενά σας και πατήστε τον σύνδεσμο για να ενεργοποιήσετε τον λογαριασμό σας.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setMessage("✅ Στάλθηκε email επαναφοράς κωδικού!");
      }
    } catch (e) {
      setError(e.message === "Invalid login credentials" ? "❌ Λάθος email ή κωδικός." : "❌ " + e.message);
    } finally { setLoading(false); }
  };

  const navy = "#1a2b5e"; const orange = "#E8622A";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ color: navy, fontSize: "1.2rem", fontWeight: 800, margin: 0 }}>
            {mode === "login" ? "Σύνδεση" : mode === "signup" ? "Εγγραφή" : "Επαναφορά Κωδικού"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>
        {mode === "signup" && (
          <input value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Ονοματεπώνυμο"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, fontSize: "0.9rem", boxSizing: "border-box", color: navy }} />
        )}
        <input value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" type="email"
          style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, fontSize: "0.9rem", boxSizing: "border-box", color: navy }} />
        {mode !== "reset" && (
          <input value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Κωδικός" type="password"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 16, fontSize: "0.9rem", boxSizing: "border-box", color: navy }} />
        )}
        {error && <p style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: 10 }}>{error}</p>}
        {message && <p style={{ color: "#22c55e", fontSize: "0.8rem", marginBottom: 10 }}>{message}</p>}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width: "100%", padding: "12px", background: `linear-gradient(135deg, ${orange}, #c94d1a)`, border: "none", borderRadius: 10, color: "#fff", fontSize: "0.95rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Παρακαλώ περιμένετε..." : mode === "login" ? "Σύνδεση" : mode === "signup" ? "Εγγραφή" : "Αποστολή Email"}
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14, textAlign: "center" }}>
          {mode === "login" && <>
            <button onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: orange, fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 }}>Δεν έχετε λογαριασμό; Εγγραφείτε</button>
            <button onClick={() => setMode("reset")} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "0.75rem", cursor: "pointer" }}>Ξεχάσατε τον κωδικό;</button>
          </>}
          {mode !== "login" && <button onClick={() => setMode("login")} style={{ background: "none", border: "none", color: orange, fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 }}>Έχετε ήδη λογαριασμό; Συνδεθείτε</button>}
        </div>
      </div>
    </div>
  );
};

const RotatingBanner = () => {
  const suffixes = [
    "Φορολογικής Καθοδήγησης",
    "Εργατικών Συμβουλών",
    "Ασφαλιστικής Ενημέρωσης",
    "Λογιστικής Υποστήριξης",
  ];
  const [index, setIndex] = React.useState(0);
  const [fade, setFade] = React.useState(true);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % suffixes.length);
        setFade(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span style={{ fontSize: "clamp(0.65rem, 2.5vw, 0.85rem)", color: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap", gap: "clamp(2px, 1vw, 4px)", width: "100%", textAlign: "center", whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 900, flexShrink: 0 }}>Η #1 Πλατφόρμα AI</span>
      <span style={{ transition: "opacity 0.3s ease", opacity: fade ? 1 : 0, fontWeight: 700, display: "inline-block", minWidth: "clamp(140px, 40vw, 220px)", textAlign: "center" }}>
        {suffixes[index]}
      </span>
    </span>
  );
};

const RotatingText = () => {
  const phrases = [
    "Η φορολογία αλλάζει διαρκώς.",
    "Τα Εργατικά αλλάζουν διαρκώς.",
    "Τα Ασφαλιστικά αλλάζουν διαρκώς.",
  ];
  const [index, setIndex] = React.useState(0);
  const [fade, setFade] = React.useState(true);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % phrases.length);
        setFade(true);
      }, 300);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span style={{ transition: "opacity 0.3s ease", opacity: fade ? 1 : 0, display: "inline-block" }}>
      {phrases[index]}
    </span>
  );
};

export default function TaxIQ() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [randomQuestions, setRandomQuestions] = useState(getRandomQuestions);
  const [randomReviews, setRandomReviews] = useState(getRandomReviews);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showRegWall, setShowRegWall] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCookiePolicy, setShowCookiePolicy] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const placeholderWords = ["φορολογικά", "λογιστικά", "εργατικά", "ασφαλιστικά"];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPlaceholderIndex(i => (i + 1) % placeholderWords.length), 2000);
    return () => clearInterval(t);
  }, []);
  const [showAbout, setShowAbout] = useState(false);
  const [showPricingPage, setShowPricingPage] = useState(false);
  const [showCookieBanner, setShowCookieBanner] = useState(() => !localStorage.getItem("taxiq_cookie_consent"));
  const [showCookieCustomize, setShowCookieCustomize] = useState(false);
  const [user, setUser] = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [reviewForm, setReviewForm] = useState({ name: "", role: "", text: "", stars: 5 });
  const [reviewStatus, setReviewStatus] = useState("");
  const [pendingReviews, setPendingReviews] = useState([]);
  const [freeQuestions, setFreeQuestions] = useState(() => {
    const saved = localStorage.getItem("taxiq_free_q");
    return saved ? parseInt(saved) : 0;
  });
  const FREE_LIMIT = 2;
  const ADMIN_EMAIL = "dachris78@gmail.com"; // Admin panel access
  const CONTACT_EMAIL = "info@taxiq.com.gr";
  const bottomRef = useRef(null);

  // Check session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch pending reviews for admin
  const fetchPendingReviews = async () => {
    const { data } = await supabase.from("reviews").select("*").eq("approved", false).order("created_at", { ascending: false });
    setPendingReviews(data || []);
  };

  const submitReview = async () => {
    if (!reviewForm.text || !reviewForm.name) { setReviewStatus("❌ Συμπληρώστε όνομα και κείμενο."); return; }
    setReviewStatus("Αποστολή...");
    const { error } = await supabase.from("reviews").insert({
      user_id: user.id,
      user_name: reviewForm.name,
      user_role: reviewForm.role,
      review_text: reviewForm.text,
      stars: reviewForm.stars,
    });
    if (error) { setReviewStatus("❌ Σφάλμα: " + error.message); }
    else { setReviewStatus("✅ Η αξιολόγησή σας στάλθηκε για έγκριση!"); setReviewForm({ name: "", role: "", text: "", stars: 5 }); setTimeout(() => setShowReviewForm(false), 2000); }
  };

  const approveReview = async (id) => {
    await supabase.from("reviews").update({ approved: true }).eq("id", id);
    fetchPendingReviews();
  };

  const deleteReview = async (id) => {
    await supabase.from("reviews").delete().eq("id", id);
    fetchPendingReviews();
  };

  const handleCookieAccept = () => {
    localStorage.setItem("taxiq_cookie_consent", "accepted");
    setShowCookieBanner(false);
  };

  const handleCookieReject = () => {
    localStorage.setItem("taxiq_cookie_consent", "rejected");
    setShowCookieBanner(false);
  };

  const handleCookieSave = (prefs) => {
    localStorage.setItem("taxiq_cookie_consent", JSON.stringify(prefs));
    setShowCookieCustomize(false);
    setShowCookieBanner(false);
  };

  const exportUserData = async () => {
    if (!user) return;
    try {
      // Fetch questions
      const { data: questions } = await supabase
        .from("user_questions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const exportData = {
        exported_at: new Date().toISOString(),
        profile: {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || "",
          created_at: user.created_at,
        },
        questions: (questions || []).map(q => ({
          date: q.created_at,
          question: q.question,
          answer: q.answer,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taxiq_data_${user.email}_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Σφάλμα κατά την εξαγωγή δεδομένων.");
    }
  };

  // Trending questions: cache TTL 4h, fetch 8 from web search, show 4 random
  const TRENDING_CACHE_KEY = "taxiq_trending_questions";
  const TRENDING_CACHE_TTL = 4 * 60 * 60 * 1000;

  useEffect(() => {
    const fetchTrendingQuestions = async () => {
      // 1. Try cache first
      try {
        const raw = localStorage.getItem(TRENDING_CACHE_KEY);
        if (raw) {
          const { questions, timestamp } = JSON.parse(raw);
          if (
            Date.now() - timestamp < TRENDING_CACHE_TTL &&
            Array.isArray(questions) && questions.length >= 4
          ) {
            const shuffled = [...questions].sort(() => Math.random() - 0.5);
            setRandomQuestions(shuffled.slice(0, 4));
            return;
          }
        }
      } catch (e) {}

      // 2. Cache stale or missing — fetch from API with web search
      try {
        const now = new Date();
        const month = now.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: "Απάντα ΜΟΝΟ στα ελληνικά. Επέστρεψε ΜΟΝΟ ένα έγκυρο JSON array χωρίς markdown, backticks ή εξηγήσεις.",
            messages: [{
              role: "user",
              content: `Κάνε αναζήτηση στο ελληνικό διαδίκτυο για το ${month} και βρες τα 8 πιο επίκαιρα και συχνά ερωτήματα που κάνουν οι Έλληνες σχετικά με φορολογικά, λογιστικά, ασφαλιστικά ή εργατικά θέματα. Λάβε υπόψη φορολογικές προθεσμίες, αλλαγές νόμων, ανακοινώσεις ΑΑΔΕ/ΕΦΚΑ/ΕΡΓΑΝΗ. Επέστρεψε ΜΟΝΟ ένα JSON array με 8 ερωτήσεις στα ελληνικά, σε μορφή: ["Ερώτηση 1;", ..., "Ερώτηση 8;"]`
            }]
          })
        });
        const data = await res.json();
        const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        const match = text.match(/\[[\s\S]*?\]/);
        if (match) {
          const questions = JSON.parse(match[0]);
          if (Array.isArray(questions) && questions.length >= 4) {
            // Save to cache
            localStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({
              questions,
              timestamp: Date.now()
            }));
            // Show 4 random from fetched
            const shuffled = [...questions].sort(() => Math.random() - 0.5);
            setRandomQuestions(shuffled.slice(0, 4));
          }
        }
      } catch (e) {
        // Fallback to static questions already set
      }
    };
    fetchTrendingQuestions();
  }, []);

  useEffect(() => {
    let timer;
    if (loading) {
      setLoadingSeconds(0);
      timer = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    } else {
      setLoadingSeconds(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const callAPI = (msgs) => {
    const now = new Date();
    const currentDate = now.toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });
    const currentYear = now.getFullYear();
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: SYSTEM_PROMPT + `\n\nΣΗΜΕΡΙΝΗ ΗΜΕΡΟΜΗΝΙΑ: ${currentDate}. ΤΡΕΧΟΝ ΕΤΟΣ: ${currentYear}.`,
        messages: msgs,
      }),
    }).then((r) => r.json());
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;

    // Check free question limit (server-side by IP)
    if (!user) {
      try {
        const limitRes = await fetch("/api/check-limit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const limitData = await limitRes.json();
        if (!limitData.allowed) {
          setShowRegWall(true);
          return;
        }
        setFreeQuestions(limitData.count);
        localStorage.setItem("taxiq_free_q", limitData.count.toString());
      } catch (e) {
        // Fail open on network error
      }
    }

    setInput("");
    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);
    setSearchingWeb(false);

    try {
      let currentMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));
      let data = await callAPI(currentMessages);

      // Retry if rate limited
      if (data.error && (data.error.includes('429') || data.error.includes('quota') || data.error.includes('rate'))) {
        setSearchingWeb(false);
        await new Promise(resolve => setTimeout(resolve, 5000));
        data = await callAPI(currentMessages);
      }

      setSearchingWeb(false);

      if (data.error) throw new Error(data.error);

      const finalText = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "";
      const didSearch = data.searched || false;

      // Extract reliability block
      const reliabilityMatch = finalText.match(/%%RELIABILITY:(.*?)%%/s);
      let reliability = null;
      let cleanText = finalText.replace(/%%RELIABILITY:.*?%%/s, "").trim();
      if (reliabilityMatch) {
        try { reliability = JSON.parse(reliabilityMatch[1]); } catch(e) {}
      }
      setMessages([...newMessages, { role: "assistant", content: cleanText, searched: didSearch, reliability }]);

      // Save to user history if logged in
      if (user) {
        supabase.from("user_questions").insert({
          user_id: user.id,
          question: userText,
          answer: cleanText,
        }).catch(() => {});
      }
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: "⚠️ Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.", searched: false }]);
    } finally {
      setLoading(false);
      setSearchingWeb(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Renders inline bold (**text**), links ([label](url)), and block-level formatting
  const renderInline = (text) => {
    const parts = [];
    // Split on **bold** and [label](url) patterns
    const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let last = 0, match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) parts.push(text.slice(last, match.index));
      if (match[1] !== undefined) {
        parts.push(<strong key={match.index} style={{ color: "#a8dde4", fontWeight: 700 }}>{match[1]}</strong>);
      } else {
        parts.push(<a key={match.index} href={match[3]} target="_blank" rel="noopener noreferrer" style={{ color: "#5bb8c4", textDecoration: "underline", wordBreak: "break-all" }}>{match[2]}</a>);
      }
      last = regex.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length > 0 ? parts : text;
  };

  const formatText = (text) =>
    text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h3 key={i} style={{ fontSize: "1rem", fontWeight: 700, color: "#5bb8c4", margin: "12px 0 4px" }}>{renderInline(line.slice(3))}</h3>;
      if (line.startsWith("### ")) return <h4 key={i} style={{ fontSize: "0.9rem", fontWeight: 700, color: "#a8dde4", margin: "10px 0 3px" }}>{renderInline(line.slice(4))}</h4>;
      // Full-line bold (standalone **text**)
      if (/^\*\*(.+)\*\*$/.test(line.trim())) return <strong key={i} style={{ display: "block", color: "#a8dde4", marginTop: 6 }}>{line.trim().slice(2, -2)}</strong>;
      if (line.startsWith("- ") || line.startsWith("• ")) return (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
          <span style={{ color: "#e8622a", fontWeight: 700, flexShrink: 0 }}>›</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      if (line.trim() === "") return <br key={i} />;
      return <p key={i} style={{ margin: "3px 0" }}>{renderInline(line)}</p>;
    });

  // Color palette
  const navy = "#1a2b5e";
  const navyDark = "#0f1c3f";
  const teal = "#5bb8c4";
  const tealDark = "#3a9aaa";
  const orange = "#e8622a";

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${navyDark} 0%, ${navy} 50%, ${navyDark} 100%)`, fontFamily: "'Georgia', 'Times New Roman', serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid rgba(91,184,196,0.2)`, padding: "10px clamp(10px, 3vw, 20px)", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(10px)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 2vw, 12px)", cursor: "pointer" }} onClick={() => { setMessages([]); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <TaxIQLogo size="clamp(42px, 10vw, 68px)" />
          <div style={{ display: "inline-flex", flexDirection: "column", justifyContent: "center" }}>
            <div id="taxiq-title" style={{ fontSize: "clamp(1.05rem, 4vw, 1.6rem)", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.1, whiteSpace: "nowrap" }}>
              Tax<span style={{ color: orange }}>IQ</span><span style={{ color: teal, fontSize: "0.7em", fontWeight: 600, letterSpacing: "0.05em" }}> AI</span>
            </div>
            <div style={{ fontSize: "clamp(0.55rem, 2vw, 0.72rem)", color: teal, marginTop: 4, whiteSpace: "nowrap", textAlign: "justify", textAlignLast: "justify" }}>
              Your <span style={{ color: "#f59e0b", fontWeight: 700 }}>24/7</span> Accountant
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg, #0f1c3f, #1a2b5e)", border: "1px solid rgba(91,184,196,0.3)", borderRadius: 20, padding: "5px clamp(8px, 2vw, 12px)", whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.3)", maxWidth: "clamp(100px, 42vw, 260px)", overflow: "hidden" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626", animation: "pulse 1.2s infinite", flexShrink: 0, boxShadow: "0 0 5px rgba(220,38,38,0.6)" }} />
            <span style={{ fontSize: "clamp(0.58rem, 2vw, 0.75rem)", color: "#dc2626", fontWeight: 900, animation: "pulse 1.2s infinite", letterSpacing: "0.03em" }}>Live</span>
            <span style={{ width: 1, height: 10, background: "rgba(91,184,196,0.3)", display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: "clamp(0.44rem, 1.4vw, 0.57rem)", color: teal, fontWeight: 700, letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis" }}>ΑΑΔΕ · ΕΦΚΑ · ΦΕΚ · ΕΡΓΑΝΗ</span>
          </div>
          {user ? (
            <button onClick={async () => { await supabase.auth.signOut(); setUser(null); }}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, padding: "5px 10px", color: "#fff", fontSize: "0.65rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Αποσύνδεση
            </button>
          ) : null}
        </div>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onAuthSuccess={(u) => { setUser(u); setShowAuthModal(false); }} />}
      {showPricingPage && <PricingPage onClose={() => setShowPricingPage(false)} user={user} onSignup={() => { setShowPricingPage(false); setShowAuthModal(true); }} />}
      {showContact && <ContactModal onClose={() => setShowContact(false)} onPrivacy={() => { setShowContact(false); setShowPrivacy(true); }} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} user={user} onSignup={() => { setShowAbout(false); setShowAuthModal(true); }} />}
      {showCookiePolicy && <CookiePolicyModal onClose={() => setShowCookiePolicy(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showFAQ && <FAQModal onClose={() => setShowFAQ(false)} />}
      {showCookieBanner && <CookieBanner onAccept={handleCookieAccept} onReject={handleCookieReject} onCustomize={() => setShowCookieCustomize(true)} />}
      {showCookieCustomize && <CookieCustomizeModal onSave={handleCookieSave} onClose={() => setShowCookieCustomize(false)} />}

      {/* Features Modal */}
      {showFeatures && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setShowFeatures(false)}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ color: "#1a2b5e", fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>Χαρακτηριστικά</h2>
              <button onClick={() => setShowFeatures(false)} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
            </div>
            {[
              { icon: "⚡", title: "Real-Time Νομοθεσία", desc: "Πρόσβαση στις τελευταίες εγκυκλίους και φορολογικές αλλαγές." },
              { icon: "🔍", title: "Live Web Search", desc: "Αξιόπιστη αναζήτηση, ενημέρωση και ανάλυση δεδομένων σε πραγματικό χρόνο από:\n• Επίσημα αρχεία & Φορείς: ΑΑΔΕ, ΦΕΚ, ΠΣ ΕΡΓΑΝΗ & ΔΥΠΑ\n• Επιχειρηματικότητα: ΓΕΜΗ, Επιμελητήρια & Προγράμματα ΕΣΠΑ\n• Βάσεις δεδομένων: Taxheaven & e-forologia\n• Πρότυπα: Ελληνικά & Διεθνή Λογιστικά Πρότυπα\n• Νομοθεσία: Κωδικοποιημένη Νομοθεσία (ΚΦΕ, ΚΦΔ, ΦΠΑ) & Ευρωπαϊκές Οδηγίες" },
              { icon: "🧠", title: "Ανάλυση Ερωτημάτων", desc: "Απαντήσεις σε σύνθετα λογιστικά και φορολογικά ερωτήματα με απλά λόγια." },
              { icon: "📚", title: "Τεκμηρίωση Πηγών", desc: "Παράθεση συνδέσμων και άρθρων για κάθε απάντηση που δίνεται." },
              { icon: "🕐", title: "24/7 Διαθεσιμότητα", desc: "Ένας έμπειρος λογιστικός σύμβουλος στην οθόνη σου, κάθε στιγμή." },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 14, marginBottom: 20, padding: "14px 16px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ color: "#1a2b5e", fontWeight: 700, fontSize: "0.9rem", marginBottom: 4 }}>{f.title}</div>
                  <div style={{ color: "#64748b", fontSize: "0.78rem", lineHeight: 1.7 }}>{f.desc.split('\n').map((line, j) => <div key={j}>{line}</div>)}</div>
                </div>
              </div>
            ))}
            <button onClick={() => { setShowFeatures(false); setShowAuthModal(true); }}
              style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg, #e8622a, #c94d1a)", border: "none", borderRadius: 12, color: "#fff", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
              Ξεκίνα Δωρεάν
            </button>
          </div>
        </div>
      )}
      {showRegWall && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setShowRegWall(false)}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
              <button onClick={() => setShowRegWall(false)} style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔒</div>
            <h2 style={{ color: "#1a2b5e", fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>Απαιτείται εγγραφή για να συνεχίσεις</h2>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: 24, lineHeight: 1.6 }}>
              Κάνε δωρεάν εγγραφή για να αποκτήσεις πλήρη πρόσβαση στον AI λογιστικό βοηθό!
            </p>
            <button onClick={() => { setShowRegWall(false); setShowAuthModal(true); }}
              style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #e8622a, #c94d1a)", border: "none", borderRadius: 12, color: "#fff", fontSize: "1rem", fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              🎉 Δωρεάν Εγγραφή — Άμεση Πρόσβαση
            </button>
            <button onClick={() => { setShowRegWall(false); setShowAuthModal(true); }}
              style={{ width: "100%", padding: "12px", background: "transparent", border: "1px solid #e2e8f0", borderRadius: 12, color: "#64748b", fontSize: "0.85rem", cursor: "pointer" }}>
              Έχω ήδη λογαριασμό — Σύνδεση
            </button>
          </div>
        </div>
      )}

      {/* #1 banner + Auth button row */}
      {messages.length === 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 16px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid rgba(91,184,196,0.1)` }}>
          <div style={{ display: "inline-flex", alignItems: "center", background: "#E8622A", borderRadius: 50, padding: "clamp(6px, 2vw, 9px) clamp(12px, 4vw, 22px)", boxShadow: "0 4px 15px rgba(232,98,42,0.4)", maxWidth: "92vw", overflow: "hidden" }}>
            <RotatingBanner />
          </div>
        </div>
      )}

      {/* Chat area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 16px", maxWidth: 760, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <TaxIQLogo size={80} />
            </div>
            <h2 className="hero-title" style={{ color: "#fff", fontSize: "1.6rem", fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Tax<span style={{ color: orange }}>IQ</span><span style={{ color: teal, fontSize: "0.6em", fontWeight: 600, letterSpacing: "0.05em" }}> AI</span></h2>
            <p style={{ color: teal, fontSize: "1.2rem", fontWeight: 700, margin: "0 0 4px", letterSpacing: "0.02em" }}>Φορολογική Νομοθεσία σε Δευτερόλεπτα</p>
            <p style={{ color: "#94a3b8", fontSize: "0.8rem", maxWidth: 480, margin: "0 auto 24px" }}>
              Ο έξυπνος βοηθός σας για Φορολογικά, Ασφαλιστικά, Λογιστικά και Εργατικά θέματα. Λάβετε έγκυρες απαντήσεις με Real-Time ενημέρωση από την τρέχουσα νομοθεσία.
            </p>

            {/* Stats cards */}
            <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 560, margin: "0 auto 24px" }}>
              {[
                { value: "10.000+", label: "Ερωτήσεις Απαντήθηκαν" },
                { value: "Real-Time", label: "Ενημέρωση Νομοθεσίας" },
                { value: "24/7", label: "Πρόσβαση Παντού" },
                { value: "30+", label: "Έτη Εμπειρίας" },
                { value: "4,8/5", label: "Μέση Αξιολόγηση" },
                { value: "98%", label: "Ακρίβεια Απαντήσεων" },
              ].map((stat, i) => (
                <div key={i} style={{ background: i % 2 === 0 ? "linear-gradient(135deg, rgba(232,98,42,0.12) 0%, rgba(232,98,42,0.04) 100%)" : "linear-gradient(135deg, rgba(91,184,196,0.12) 0%, rgba(91,184,196,0.04) 100%)", border: `1px solid ${i % 2 === 0 ? "rgba(232,98,42,0.25)" : "rgba(91,184,196,0.25)"}`, borderRadius: 16, padding: "18px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: i % 2 === 0 ? orange : teal, letterSpacing: "-0.02em", marginBottom: 4 }}>{stat.value}</div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", letterSpacing: "0.04em" }}>{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="questions-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 600, margin: "0 auto" }}>
              {randomQuestions.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid rgba(91,184,196,0.2)`, borderRadius: 12, padding: "12px 14px", color: "#cbd5e1", fontSize: "0.82rem", textAlign: "left", cursor: "pointer", transition: "all 0.2s", lineHeight: 1.4 }}
                  onMouseEnter={e => { e.currentTarget.style.background = `rgba(91,184,196,0.12)`; e.currentTarget.style.borderColor = `rgba(91,184,196,0.5)`; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(91,184,196,0.2)"; e.currentTarget.style.color = "#cbd5e1"; }}>
                  {q}
                </button>
              ))}
            </div>

            {/* Inline search bar above testimonials */}
            <div className="search-row" style={{ maxWidth: 600, margin: "28px auto 0", display: "flex", gap: 10, alignItems: "center" }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={`Ρωτήστε οτιδήποτε για ${placeholderWords[placeholderIndex]}...`}
                rows={1}
                style={{ flex: 1, resize: "none", border: `1px solid rgba(91,184,196,0.3)`, borderRadius: 14, padding: "12px 16px", background: "#ffffff", color: "#1a2b5e", fontSize: "0.9rem", fontFamily: "inherit", outline: "none", lineHeight: 1.5, boxSizing: "border-box", transition: "border-color 0.2s" }}
                onFocus={e => e.target.style.borderColor = `rgba(91,184,196,0.7)`}
                onBlur={e => e.target.style.borderColor = "rgba(91,184,196,0.3)"}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: `linear-gradient(135deg, ${orange}, #c94d1a)`, color: "#fff", cursor: loading || !input.trim() ? "not-allowed" : "pointer", flexShrink: 0, boxShadow: `0 4px 15px rgba(232,98,42,0.4)`, transition: "all 0.2s", opacity: loading || !input.trim() ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 20V4M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <p style={{ textAlign: "center", color: "#ffffff", fontSize: "0.68rem", marginTop: 8, maxWidth: 600, margin: "8px auto 0" }}>
              Δεν αντικαθιστά επαγγελματία λογιστή · Για σύνθετα θέματα συμβουλευτείτε ειδικό
            </p>
            {!user && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                <button onClick={() => setShowAuthModal(true)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg, ${orange}, #c94d1a)`, border: "none", borderRadius: 50, padding: "10px 28px", color: "#fff", fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, boxShadow: "0 4px 16px rgba(232,98,42,0.4)", transition: "all 0.2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#c94d1a"}
                  onMouseLeave={e => e.currentTarget.style.background = `linear-gradient(135deg, ${orange}, #c94d1a)`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Σύνδεση / Εγγραφή
                </button>
              </div>
            )}

            {/* Feature cards */}
            <div className="feature-cards" style={{ maxWidth: 600, margin: "28px auto 0", display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  icon: <path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="#E8622A" strokeWidth="2.2" strokeLinecap="round"/>,
                  title: "Αναζήτηση σε Πραγματικό Χρόνο",
                  desc: "Ψάχνει τους πιο πρόσφατους νόμους, εγκυκλίους και αποφάσεις από ΑΑΔΕ, ΕΦΚΑ, ΦΕΚ και ΕΡΓΑΝΗ"
                },
                {
                  icon: <><path d="M4 19V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12" stroke="#E8622A" strokeWidth="2.2" strokeLinecap="round"/><path d="M4 19h16M9 5v14" stroke="#E8622A" strokeWidth="2.2" strokeLinecap="round"/></>,
                  title: "Αναφορές σε Νόμους & Πηγές",
                  desc: "Κάθε απάντηση συνοδεύεται από συγκεκριμένα άρθρα νόμων, εγκυκλίους και αξιόπιστες πηγές"
                },
                {
                  icon: <path d="M12 3l2.5 5.5L21 9.5l-4.5 4.5 1 6.5L12 17.5 6.5 20.5l1-6.5L3 9.5l6.5-1L12 3z" stroke="#E8622A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>,
                  title: "Δείκτης Αξιοπιστίας",
                  desc: "Ξεκάθαρη ένδειξη αξιοπιστίας για κάθε απάντηση — γνωρίζεις πάντα πόσο σίγουρη είναι η πληροφορία"
                },
                {
                  icon: <><path d="M9 12l2 2 4-4" stroke="#E8622A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9z" stroke="#E8622A" strokeWidth="2.2"/></>,
                  title: "Φορολογικά, Ασφαλιστικά & Εργατικά",
                  desc: "Καλύπτει όλους τους τομείς: ΦΠΑ, εισοδηματικός φόρος, ΕΦΚΑ, μισθοδοσία, εργατικό δίκαιο και πολλά ακόμα"
                },


              ].map((f, i) => {
                const iconColor = i % 2 === 0 ? "#5bb8c4" : "#E8622A";
                const iconHtml = typeof f.icon === "string" ? f.icon : React.cloneElement(
                  <svg>{f.icon}</svg>,
                  {}
                );
                return (
                <div key={i} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(91,184,196,0.15)", borderLeft: `3px solid ${iconColor}`, borderRadius: 16, padding: "18px 20px", textAlign: "left", animation: `slideUp 0.5s ease both`, animationDelay: `${i * 0.12}s` }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 10, color: iconColor }}>
                    {React.Children.map(f.icon.props ? [f.icon] : React.Children.toArray(f.icon), child =>
                      React.isValidElement(child) ? React.cloneElement(child, {
                        stroke: iconColor,
                        ...Object.fromEntries(Object.entries(child.props).filter(([k]) => k !== 'stroke'))
                      }) : child
                    )}
                  </svg>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff", marginBottom: 5 }}>{f.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.55 }}>{f.desc}</div>
                </div>
                );
              })}
            </div>

            {/* Testimonials */}
            <div style={{ maxWidth: 600, margin: "32px auto 0", textAlign: "center" }}>
              <div style={{ textAlign: "center", marginBottom: 4 }}>
                <h3 style={{ color: "#fff", fontSize: "1.2rem", fontWeight: 800, margin: 0 }}>Τι λένε οι χρήστες μας</h3>
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
                  {user?.email === ADMIN_EMAIL && (
                    <button onClick={() => { setShowAdminPanel(true); fetchPendingReviews(); }}
                      style={{ background: "#1a2b5e", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, padding: "6px 12px", color: "#fff", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>
                      ⚙️ Admin
                    </button>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#5bb8c4", margin: "0 0 6px" }}>
                  <span>Χιλιάδες </span>
                  Επαγγελματίες, Επιχειρήσεις & Εργαζόμενοι
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div style={{ height: 1, width: 36, background: "rgba(232,98,42,0.4)" }} />
                  <span style={{ color: "#E8622A", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>εμπιστεύονται το TaxIQ AI</span>
                  <div style={{ height: 1, width: 36, background: "rgba(232,98,42,0.4)" }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {randomReviews.map((review, i) => (
                  <div key={i} style={{ background: "#ffffff", border: "1px solid rgba(26,43,94,0.12)", borderRadius: 16, padding: "16px 18px", textAlign: "left", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
                    <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
                      {Array(review.stars).fill(0).map((_, s) => (
                        <svg key={s} width="16" height="16" viewBox="0 0 24 24" fill="#E8622A"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      ))}
                    </div>
                    <p style={{ color: "#1a2b5e", fontSize: "0.85rem", lineHeight: 1.6, margin: "0 0 10px", fontStyle: "italic" }}>"{review.text}"</p>
                    <div>
                      <span style={{ color: "#1a2b5e", fontSize: "0.8rem", fontWeight: 700 }}>{review.name}</span>
                      <span style={{ color: "#5bb8c4", fontSize: "0.72rem", marginLeft: 8, fontWeight: 600 }}>{review.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Review Form Modal */}
            {showReviewForm && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setShowReviewForm(false)}>
                <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ color: "#1a2b5e", fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>Γράψτε Αξιολόγηση</h2>
                    <button onClick={() => setShowReviewForm(false)} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                    {[1,2,3,4,5].map(s => (
                      <button key={s} onClick={() => setReviewForm({...reviewForm, stars: s})}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem" }}>
                        {s <= reviewForm.stars ? "⭐" : "☆"}
                      </button>
                    ))}
                  </div>
                  <input value={reviewForm.name} onChange={e => setReviewForm({...reviewForm, name: e.target.value})}
                    placeholder="Ονοματεπώνυμο *"
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, fontSize: "0.88rem", boxSizing: "border-box", color: "#1a2b5e" }} />
                  <input value={reviewForm.role} onChange={e => setReviewForm({...reviewForm, role: e.target.value})}
                    placeholder="Επάγγελμα / Ρόλος"
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, fontSize: "0.88rem", boxSizing: "border-box", color: "#1a2b5e" }} />
                  <textarea value={reviewForm.text} onChange={e => setReviewForm({...reviewForm, text: e.target.value})}
                    placeholder="Η αξιολόγησή σας *" rows={4}
                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 14, fontSize: "0.88rem", boxSizing: "border-box", resize: "none", color: "#1a2b5e" }} />
                  {reviewStatus && <p style={{ fontSize: "0.8rem", color: reviewStatus.startsWith("✅") ? "#22c55e" : "#ef4444", marginBottom: 10 }}>{reviewStatus}</p>}
                  <button onClick={submitReview}
                    style={{ width: "100%", padding: 12, background: `linear-gradient(135deg, ${orange}, #c94d1a)`, border: "none", borderRadius: 10, color: "#fff", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer" }}>
                    Υποβολή Αξιολόγησης
                  </button>
                  <p style={{ fontSize: "0.7rem", color: "#94a3b8", textAlign: "center", marginTop: 10 }}>Η αξιολόγησή σας θα εμφανιστεί μετά από έγκριση.</p>
                </div>
              </div>
            )}

            {/* Admin Panel Modal */}
            {showAdminPanel && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setShowAdminPanel(false)}>
                <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ color: "#1a2b5e", fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>⚙️ Admin — Αξιολογήσεις προς Έγκριση</h2>
                    <button onClick={() => setShowAdminPanel(false)} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}>✕</button>
                  </div>
                  {pendingReviews.length === 0 ? (
                    <p style={{ color: "#64748b", textAlign: "center", padding: 20 }}>✅ Δεν υπάρχουν αξιολογήσεις προς έγκριση.</p>
                  ) : pendingReviews.map(r => (
                    <div key={r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
                        {Array(r.stars).fill(0).map((_, s) => <span key={s}>⭐</span>)}
                      </div>
                      <p style={{ color: "#1a2b5e", fontSize: "0.85rem", margin: "0 0 6px", fontStyle: "italic" }}>"{r.review_text}"</p>
                      <p style={{ color: "#64748b", fontSize: "0.75rem", margin: "0 0 12px" }}><strong>{r.user_name}</strong> · {r.user_role} · {new Date(r.created_at).toLocaleDateString("el-GR")}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => approveReview(r.id)}
                          style={{ flex: 1, padding: "8px", background: "#22c55e", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>
                          ✅ Έγκριση
                        </button>
                        <button onClick={() => deleteReview(r.id)}
                          style={{ flex: 1, padding: "8px", background: "#ef4444", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>
                          🗑️ Διαγραφή
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pre-footer CTA */}
            {!user && (
              <div style={{ maxWidth: 600, margin: "48px auto 0" }}>
                <div style={{ background: `linear-gradient(135deg, rgba(232,98,42,0.12) 0%, rgba(91,184,196,0.1) 100%)`, border: "1px solid rgba(232,98,42,0.25)", borderRadius: 20, padding: "32px 28px", textAlign: "center", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${orange}, ${teal})` }} />
                  <h3 style={{ color: "#fff", fontSize: "1.2rem", fontWeight: 900, margin: "0 0 10px", lineHeight: 1.35 }}>
                    <RotatingText /><br/>
                    <span style={{ color: teal }}>Εσείς έχετε τον σωστό σύμμαχο;</span>
                  </h3>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.84rem", margin: "0 0 24px", lineHeight: 1.65, textWrap: "balance" }}>
                    Γίνετε μέλος της κοινότητας του TaxIQ AI και αναβαθμίστε την ποιότητα των υπηρεσιών σας.
                  </p>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    style={{ background: `linear-gradient(135deg, ${orange}, #c94d1a)`, border: "none", borderRadius: 50, padding: "13px 36px", color: "#fff", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 6px 20px rgba(232,98,42,0.4)`, transition: "all 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#c94d1a"}
                    onMouseLeave={e => e.currentTarget.style.background = `linear-gradient(135deg, ${orange}, #c94d1a)`}
                  >
                    Δημιουργία Λογαριασμού
                  </button>
                  <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", marginTop: 10, marginBottom: 0 }}>Δωρεάν · Χωρίς πιστωτική κάρτα</p>
                </div>
              </div>
            )}

            {/* Full Footer */}
            <div style={{ marginTop: 48, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 40, paddingBottom: 24 }}>
              
              {/* Footer columns */}
              <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 32, marginBottom: 40, maxWidth: 900, margin: "0 auto 40px" }}>
                
                {/* Brand column */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <TaxIQLogo size={32} />
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.1rem" }}>Tax<span style={{ color: "#E8622A" }}>IQ</span><span style={{ color: "#5bb8c4", fontSize: "0.7em", fontWeight: 600, letterSpacing: "0.05em" }}> AI</span></span>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem", lineHeight: 1.7, margin: 0 }}>
                    Άμεσες απαντήσεις για Φορολογικά, Ασφαλιστικά και Εργατικά θέματα.
                  </p>
                </div>

                {/* TaxIQ */}
                <div>
                  <h4 style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700, marginBottom: 14, letterSpacing: "0.05em" }}>TaxIQ AI</h4>
                  {["Χαρακτηριστικά", "Τιμολόγηση", "Συχνές Ερωτήσεις (FAQ)"].map(item => (
                    <div key={item} style={{ marginBottom: 8 }}>
                      <a href="#" onClick={e => { e.preventDefault(); if(item === "Χαρακτηριστικά") setShowFeatures(true); if(item === "Τιμολόγηση") setShowPricingPage(true); if(item === "Συχνές Ερωτήσεις (FAQ)") setShowFAQ(true); }}
                        style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", textDecoration: "none" }}
                        onMouseEnter={e => e.target.style.color = "#E8622A"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.55)"}>{item}</a>
                    </div>
                  ))}
                </div>

                {/* Εταιρεία */}
                <div>
                  <h4 style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700, marginBottom: 14, letterSpacing: "0.05em" }}>Εταιρεία</h4>
                  {[
                    { label: "Σχετικά με Εμάς", href: "#", onClick: () => setShowAbout(true) },
                    { label: "Επικοινωνία", href: "#", onClick: () => setShowContact(true) },
                  ].map(item => (
                    <div key={item.label} style={{ marginBottom: 8 }}>
                      <a href={item.href} target={item.href !== "#" ? "_blank" : "_self"} rel="noopener noreferrer"
                        onClick={e => { if(item.onClick) { e.preventDefault(); item.onClick(); } }}
                        style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", textDecoration: "none" }}
                        onMouseEnter={e => e.target.style.color = "#E8622A"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.55)"}>{item.label}</a>
                    </div>
                  ))}
                </div>

                {/* Νομικά */}
                <div>
                  <h4 style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700, marginBottom: 14, letterSpacing: "0.05em" }}>Νομικά</h4>
                  {["Όροι Χρήσης", "Πολιτική Απορρήτου & Προστασίας Δεδομένων", "Πολιτική Cookies"].map(item => (
                    <div key={item} style={{ marginBottom: 8 }}>
                      <a href="#" onClick={e => { e.preventDefault(); if(item === "Όροι Χρήσης") setShowTerms(true); if(item === "Πολιτική Απορρήτου & Προστασίας Δεδομένων") setShowPrivacy(true); if(item === "Πολιτική Cookies") setShowCookiePolicy(true); }}
                        style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", textDecoration: "none" }}
                        onMouseEnter={e => e.target.style.color = "#E8622A"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.55)"}>{item}</a>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom bar */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20, maxWidth: 900, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", margin: 0 }}>
                    © 2024-2026 TaxIQ AI · Powered by{" "}
                    <a href="https://www.logistis-online.gr" target="_blank" rel="noopener noreferrer"
                      style={{ color: "#E8622A", textDecoration: "none", fontWeight: 600 }}>logistis-online.gr</a>
                    {" "}· Με την επιφύλαξη παντός νόμιμου δικαιώματος.
                  </p>
                </div>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12, textAlign: "center" }}>
                  <p style={{ color: "rgba(255,255,255,0.18)", fontSize: "0.5rem", margin: 0, lineHeight: 1.65, fontStyle: "italic" }}>
                    <strong style={{ fontWeight: 600, fontStyle: "normal" }}>Αποποίηση Ευθύνης (Disclaimer):</strong>{" "}Οι απαντήσεις που παρέχονται από τον AI λογιστικό βοηθό του TaxIQ AI βασίζονται σε ανάλυση δεδομένων από επίσημες πηγές και την τρέχουσα νομοθεσία, ωστόσο έχουν αποκλειστικά ενημερωτικό και συμβουλευτικό χαρακτήρα. Παρά τη συνεχή προσπάθεια για την εγκυρότητα των πληροφοριών, η χρήση του TaxIQ AI δεν υποκαθιστά την εξατομικευμένη συμβουλή ενός πιστοποιημένου Λογιστή-Φοροτεχνικού ή Νομικού συμβούλου. Οι δημιουργοί του TaxIQ AI δεν φέρουν ευθύνη για τυχόν αποφάσεις που βασίζονται αποκλειστικά στις απαντήσεις της εφαρμογής. Συνιστάται πάντα η τελική επιβεβαίωση των στοιχείων πριν από οποιαδήποτε φορολογική ή επιχειρηματική ενέργεια.
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 8, animation: "fadeUp 0.3s ease" }}>
              {msg.role === "assistant" && (
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginRight: 10, marginTop: 2 }}>
                  <TaxIQLogo size={32} />
                </div>
              )}
              <div style={{ maxWidth: "80%" }}>
                <div style={{ background: msg.role === "user" ? `linear-gradient(135deg, ${orange}, #c94d1a)` : "rgba(255,255,255,0.06)", border: msg.role === "user" ? "none" : `1px solid rgba(91,184,196,0.15)`, borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px", padding: "12px 16px", color: "#e2e8f0", fontSize: "0.9rem", lineHeight: 1.65, boxShadow: msg.role === "user" ? `0 4px 15px rgba(232,98,42,0.3)` : "0 2px 10px rgba(0,0,0,0.2)" }}>
                  {msg.role === "assistant" && msg.searched && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid rgba(91,184,196,0.15)` }}>
                      <span style={{ fontSize: "0.65rem", color: teal, letterSpacing: "0.1em" }}>🔍 ΕΝΗΜΕΡΩΘΗΚΕ ΑΠΟ ΤΟ ΔΙΑΔΙΚΤΥΟ</span>
                    </div>
                  )}
                  {msg.role === "assistant" ? formatText(msg.content) : msg.content}
                  {msg.role === "assistant" && <ReliabilityBadge reliability={msg.reliability} />}
                  {msg.role === "assistant" && (
                    <div style={{ marginTop: 12, background: "rgba(255,248,220,0.12)", border: "1px solid rgba(255,220,100,0.25)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: "0.7rem", flexShrink: 0, marginTop: 1 }}>⚠️</span>
                      <p style={{ margin: 0, fontSize: "0.6rem", color: "#fde68a", lineHeight: 1.55 }}>
                        <strong>Σημαντική Ενημέρωση:</strong> Οι πληροφορίες που παρέχονται εδώ είναι γενικές. Κάθε περίπτωση είναι μοναδική και οι νόμοι αλλάζουν διαρκώς. Δεν αναλαμβάνουμε καμία ευθύνη για τη χρήση των πληροφοριών αυτών. Πριν προχωρήσετε σε οποιαδήποτε ενέργεια, συμβουλευτείτε πάντα Επαγγελματία Λογιστή.
                      </p>
                    </div>
                  )}
                </div>
                {msg.role === "assistant" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6, paddingLeft: 4 }}>
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      title="Αντιγραφή"
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 10px", color: "#94a3b8", fontSize: "0.68rem", cursor: "pointer", transition: "all 0.2s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#94a3b8"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/></svg>
                      Αντιγραφή
                    </button>
                    <button
                      onClick={() => navigator.share ? navigator.share({ text: msg.content }) : navigator.clipboard.writeText(msg.content)}
                      title="Κοινοποίηση"
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 10px", color: "#94a3b8", fontSize: "0.68rem", cursor: "pointer", transition: "all 0.2s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#94a3b8"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2"/></svg>
                      Κοινοποίηση
                    </button>
                  </div>
                )}
              </div>
            </div>
            {msg.role === "assistant" && i === messages.length - 1 && !loading && (
              <div style={{ marginTop: 12, marginBottom: 8 }}>
                {user ? (
                  <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(91,184,196,0.2)", borderRadius: 12, padding: "12px 16px", textAlign: "center", cursor: "pointer" }}
                    onClick={() => setShowReviewForm(true)}>
                    <span style={{ fontSize: "0.75rem", color: teal }}>⭐ Αφήστε μια αξιολόγηση για την απάντηση</span>
                  </div>
                ) : (
                  <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(91,184,196,0.2)", borderRadius: 12, padding: "12px 16px", textAlign: "center", cursor: "pointer" }}
                    onClick={() => setShowAuthModal(true)}>
                    <span style={{ fontSize: "0.75rem", color: teal }}>⭐ <span style={{ color: orange, fontWeight: 700 }}>Συνδεθείτε</span> για να αφήσετε αξιολόγηση</span>
                  </div>
                )}
              </div>
            )}
            {msg.role === "assistant" && i === messages.length - 1 && !loading && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8, marginBottom: 16 }}>
                <button
                  onClick={() => { setMessages([]); setInput(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "#E8622A", border: "none", borderRadius: 50, padding: "11px 36px", color: "#fff", fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, boxShadow: "0 4px 15px rgba(232,98,42,0.4)", transition: "all 0.2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#c94d1a"}
                  onMouseLeave={e => e.currentTarget.style.background = "#E8622A"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 21V12h6v9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Επιστροφή στην Αρχική
                </button>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 16, animation: "fadeUp 0.3s ease" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginRight: 10 }}>
              <TaxIQLogo size={32} />
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", border: `1px solid rgba(91,184,196,0.15)`, borderRadius: "4px 18px 18px 18px", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
              {searchingWeb
                ? <><span style={{ fontSize: "0.8rem", color: teal }}>🔍</span><span style={{ color: teal, fontSize: "0.82rem" }}>Αναζήτηση σε ΑΑΔΕ, ΕΦΚΑ, ΦΕΚ, ΕΡΓΑΝΗ, κόμβους, επιμελητήρια...</span></>
                : <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                    {loadingSeconds < 5
                      ? "Γίνεται διασταύρωση των δεδομένων..."
                      : loadingSeconds < 15
                      ? "Αναζήτηση στην τρέχουσα νομοθεσία..."
                      : "Οριστικοποίηση και συγχρονισμός με τις τελευταίες διατάξεις..."}
                  </span>
              }
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map(n => (
                  <div key={n} style={{ width: 5, height: 5, borderRadius: "50%", background: searchingWeb ? teal : "#94a3b8", animation: `bounce 1s ${n * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(91,184,196,0.2); border-radius: 2px; }
        textarea::placeholder { color: #475569; }

        /* ── RESPONSIVE ── */

        /* Tablet (max 900px) */
        @media (max-width: 900px) {
          .pricing-grid { grid-template-columns: 1fr 1fr !important; }
          .pricing-modal { max-width: 600px !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
          .questions-grid { grid-template-columns: 1fr 1fr !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }

        /* Mobile (max 600px) */
        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
          /* Header */
          .taxiq-header { padding: 10px 12px !important; }
          .taxiq-logo-text { font-size: 1.2rem !important; }
          .taxiq-logo-sub { display: none !important; }

          /* Homepage hero */
          .hero-title { font-size: 1.3rem !important; }
          .hero-tagline { font-size: 1rem !important; }
          .hero-subtitle { font-size: 0.75rem !important; }

          /* Stats + question cards: 1 column */
          .stats-grid { grid-template-columns: 1fr 1fr !important; max-width: 100% !important; }
          .questions-grid { grid-template-columns: 1fr !important; max-width: 100% !important; }

          /* Feature cards */
          .feature-cards { max-width: 100% !important; padding: 0 4px !important; }

          /* Pricing: 1 column stacked */
          .pricing-grid { grid-template-columns: 1fr !important; }
          .pricing-modal { max-width: 98vw !important; padding: 12px !important; }

          /* Modals */
          .modal-inner { max-width: 98vw !important; padding: 14px 14px 24px !important; }
          .modal-header { padding: 14px 16px !important; }
          .modal-header h2 { font-size: 0.95rem !important; }

          /* Footer */
          .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 16px !important; font-size: 0.85rem !important; }
          .footer-bottom { flex-direction: column !important; gap: 6px !important; text-align: center !important; }

          /* CTA pre-footer */
          .cta-block { padding: 22px 16px !important; }
          .cta-title { font-size: 1rem !important; }

          /* Cookie banner */
          .cookie-banner { flex-direction: column !important; gap: 10px !important; }
          .cookie-buttons { width: 100% !important; justify-content: stretch !important; }
          .cookie-buttons button { flex: 1 !important; }

          /* Chat input */
          .chat-input-row { padding: 0 8px 12px !important; }

          /* Testimonials grid */
          .testimonials-grid { grid-template-columns: 1fr !important; }

          /* Search bar */
          .search-row { max-width: 100% !important; }
        }

        /* Very small (max 380px) */
        @media (max-width: 380px) {
          .hero-title { font-size: 1.1rem !important; }
          .stats-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
