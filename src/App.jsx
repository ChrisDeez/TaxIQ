import { useState, useRef, useEffect } from "react";

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
  "Ποιο είναι το αφορολόγητο όριο εισοδήματος για το 2025;",
  "Ποιος είναι ο κατώτατος μισθός για το 2025;",
  "Πόσο είναι οι εισφορές ΕΦΚΑ για ελεύθερο επαγγελματία 2025;",
  "Πώς υπολογίζεται η αποζημίωση απόλυσης;",
  "Ποιες είναι οι προθεσμίες υποβολής φορολογικής δήλωσης Ε1;",
  "Πώς δηλώνω εισόδημα από Airbnb στην εφορία;",
  "Τι ισχύει για τις υπερωρίες στον ιδιωτικό τομέα;",
  "Πόσες ημέρες άδεια δικαιούται ένας εργαζόμενος το 2025;",
  "Πώς υπολογίζεται ο ΕΝΦΙΑ για το 2025;",
  "Τι είναι το myDATA και ποιες επιχειρήσεις υποχρεούνται;",
  "Ποιες δαπάνες εκπίπτουν φορολογικά για ελεύθερους επαγγελματίες;",
  "Πώς δηλώνω πρόσληψη εργαζομένου στην ΕΡΓΑΝΗ;",
  "Τι αλλαγές έγιναν στη φορολογία εισοδήματος για το 2025;",
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
  { stars: 5, text: "Έχω ΙΚΕ με 5 υπαλλήλους και πολλές φορολογικές υποχρεώσεις. Το TaxIQ μου λύνει άμεσα απορίες για ΦΠΑ, μισθοδοσία και εταιρικό φόρο.", name: "Νίκος Θ.", role: "Ιδιοκτήτης ΙΚΕ - Εμπορίου" },
  { stars: 5, text: "Ως υπάλληλος τράπεζας δεν ήξερα τίποτα για τα εργασιακά μου δικαιώματα. Τώρα ξέρω ακριβώς τι δικαιούμαι σε υπερωρίες, άδειες και αποζημίωση.", name: "Ελένη Σ.", role: "Υπάλληλος Τράπεζας" },
  { stars: 5, text: "Διδάσκω σε λύκειο και κάνω παράλληλα φροντιστήριο. Βρήκα επιτέλους ξεκάθαρες απαντήσεις για το πώς φορολογούμαι και τι εισφορές πληρώνω στον ΕΦΚΑ.", name: "Δημήτρης Λ.", role: "Καθηγητής Μέσης Εκπαίδευσης" },
  { stars: 5, text: "Είμαι διευθύνων σύμβουλος σε ΑΕ τεχνολογίας. Το TaxIQ μας βοηθά να παρακολουθούμε αλλαγές σε φορολογία εταιρειών, ΦΠΑ ψηφιακών υπηρεσιών και εργατική νομοθεσία.", name: "Χρήστος Δ.", role: "Διευθύνων Σύμβουλος ΑΕ" },
  { stars: 5, text: "Στη δουλειά μου ασχολούμαι καθημερινά με συμβάσεις εργασίας και απολύσεις. Το TaxIQ με ενημερώνει άμεσα για κάθε αλλαγή στην εργατική νομοθεσία.", name: "Αγγελική Ρ.", role: "HR Manager - Πολυεθνική Εταιρεία" },
  { stars: 5, text: "Είμαι δημόσιος υπάλληλος και δεν ήξερα πώς να δηλώσω τα επιπλέον εισοδήματά μου. Το TaxIQ μου έδωσε σαφείς οδηγίες βήμα-βήμα.", name: "Βασίλης Χ.", role: "Δημόσιος Υπάλληλος - Υπουργείο" },
  { stars: 5, text: "Έχω εστιατόριο και πάντα είχα σύγχυση με δώρα εορτών, άδειες και ΕΡΓΑΝΗ. Το TaxIQ μου τα εξηγεί όλα απλά και με παραδείγματα.", name: "Σταύρος Π.", role: "Ιδιοκτήτης Εστιατορίου" },
  { stars: 5, text: "Ως ιατρός με ιδιωτικό ιατρείο έχω ιδιαίτερες φορολογικές υποχρεώσεις. Το TaxIQ με κρατά ενήμερο για εισφορές ΕΦΚΑ και αλλαγές στη φορολογία ελευθέρων επαγγελματιών.", name: "Κατερίνα Β.", role: "Παθολόγος - Ιδιωτικό Ιατρείο" },
  { stars: 5, text: "Είμαι νέος δικηγόρος και το TaxIQ με βοηθά να αντιμετωπίζω εργατικά και φορολογικά θέματα των πελατών μου με ακρίβεια και αυτοπεποίθηση.", name: "Λευτέρης Γ.", role: "Δικηγόρος - Εργατολόγος" },
  { stars: 5, text: "Νοσηλεύτρια στο ΕΣΥ με πολλές απορίες για εφημερίες, ΕΦΚΑ και σύνταξη. Το TaxIQ τα εξήγησε όλα με απλά λόγια — δεν χρειάστηκε να ψάξω πουθενά αλλού.", name: "Ζωή Π.", role: "Νοσηλεύτρια ΕΣΥ" },
  { stars: 5, text: "Διαχειρίζομαι το λογιστήριο εταιρείας με 50 εργαζόμενους. Το TaxIQ μάς βοηθά να είμαστε πάντα συμμορφωμένοι με τη νομοθεσία χωρίς χαμένο χρόνο.", name: "Ειρήνη Τ.", role: "Επικεφαλής Λογιστηρίου" },
  { stars: 5, text: "Εργάζομαι σε σούπερ μάρκετ και δεν ήξερα τα δικαιώματά μου. Μέσα σε λίγα λεπτά έμαθα για άδειες, επιδόματα και τι γίνεται σε περίπτωση απόλυσης.", name: "Θανάσης Κ.", role: "Υπάλληλος Λιανικού Εμπορίου" },
  { stars: 5, text: "Ως μηχανικός με ατομική επιχείρηση το TaxIQ μου λύνει άμεσα απορίες για myDATA, εισφορές και φορολογικές δηλώσεις — χωρίς να χρειαστεί να τηλεφωνήσω στον λογιστή μου.", name: "Παναγιώτης Ν.", role: "Μηχανολόγος Μηχανικός" },
  { stars: 5, text: "Δασκάλα στο δημόσιο με ιδιαίτερα μαθήματα. Βρήκα επιτέλους ξεκάθαρη απάντηση για τη φορολόγησή μου χωρίς να μπερδεύομαι με τους νόμους.", name: "Σοφία Α.", role: "Εκπαιδευτικός Πρωτοβάθμιας" },
  { stars: 5, text: "Είμαι μεσίτης και είχα πολλές απορίες για ΦΠΑ, φορολόγηση προμηθειών και ΕΦΚΑ. Το TaxIQ μου έδωσε τεκμηριωμένες απαντήσεις με παραπομπές σε νόμους.", name: "Ιωάννης Φ.", role: "Μεσίτης Ακινήτων" },
  { stars: 5, text: "Ασφαλιστικός σύμβουλος με εισόδημα από προμήθειες. Πλέον δηλώνω σωστά τα εισοδήματά μου χάρη στο TaxIQ — κάτι που δεν ήξερα πώς να κάνω πριν.", name: "Φώτης Α.", role: "Ασφαλιστικός Σύμβουλος" },
  { stars: 5, text: "Εργάζομαι ως λογιστής με πάνω από 200 πελάτες. Το TaxIQ μου εξοικονομεί χρόνο καθημερινά — ιδίως σε ερωτήσεις που χρειάζονται άμεση και τεκμηριωμένη απάντηση.", name: "Κώστας Β.", role: "Λογιστής - 200+ Πελάτες" },
  { stars: 5, text: "Δεν έχω δική μου επιχείρηση, απλά θέλω να ξέρω τα δικαιώματά μου ως εργαζόμενος. Το TaxIQ με βοήθησε να καταλάβω τη σύμβασή μου και τι πρέπει να πληρώνω στην εφορία.", name: "Μιχάλης Δ.", role: "Ιδιωτικός Υπάλληλος - Γραφείο" },
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
          body: JSON.stringify({ email, type: "signup" })
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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
  const FREE_LIMIT = 3;
  const ADMIN_EMAIL = "dachris78@gmail.com";
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

  // Fetch trending questions dynamically on load
  useEffect(() => {
    const fetchTrendingQuestions = async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 800,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{
              role: "user",
              content: `Ψάξε στο ελληνικό διαδίκτυο ποια είναι τα 4 πιο συχνά ερωτήματα που κάνουν οι Έλληνες αυτή την εποχή σχετικά με φορολογικά, λογιστικά, ασφαλιστικά ή εργατικά θέματα. Επέστρεψε ΜΟΝΟ ένα JSON array με 4 ερωτήσεις στα ελληνικά, χωρίς καμία άλλη εξήγηση. Παράδειγμα: ["Ερώτηση 1;", "Ερώτηση 2;", "Ερώτηση 3;", "Ερώτηση 4;"]`
            }]
          })
        });
        const data = await res.json();
        const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        const match = text.match(/\[[\s\S]*?\]/);
        if (match) {
          const questions = JSON.parse(match[0]);
          if (Array.isArray(questions) && questions.length === 4) {
            setRandomQuestions(questions);
          }
        }
      } catch (e) {
        // fallback to static questions already set
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

    // Check free question limit
    if (!user && freeQuestions >= FREE_LIMIT) {
      setShowRegWall(true);
      return;
    }

    setInput("");
    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);
    setSearchingWeb(false);

    // Increment free question counter
    if (!user) {
      const newCount = freeQuestions + 1;
      setFreeQuestions(newCount);
      localStorage.setItem("taxiq_free_q", newCount.toString());
    }

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

  const formatText = (text) =>
    text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h3 key={i} style={{ fontSize: "1rem", fontWeight: 700, color: "#5bb8c4", margin: "12px 0 4px" }}>{line.slice(3)}</h3>;
      if (line.startsWith("**") && line.endsWith("**")) return <strong key={i} style={{ display: "block", color: "#a8dde4" }}>{line.slice(2, -2)}</strong>;
      if (line.startsWith("- ") || line.startsWith("• ")) return (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
          <span style={{ color: "#e8622a", fontWeight: 700, flexShrink: 0 }}>›</span>
          <span>{line.slice(2)}</span>
        </div>
      );
      if (line.trim() === "") return <br key={i} />;
      return <p key={i} style={{ margin: "3px 0" }}>{line}</p>;
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
      <div style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid rgba(91,184,196,0.2)`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(10px)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => { setMessages([]); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <TaxIQLogo size={68} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Tax<span style={{ color: orange }}>IQ</span>
            </div>
            <div style={{ fontSize: "0.55rem", color: teal, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 2 }}>Λογιστικός Βοηθός AI</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,1)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 20, padding: "5px 10px", whiteSpace: "nowrap" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626", animation: "pulse 1.2s infinite", flexShrink: 0 }} />
            <span style={{ fontSize: "0.82rem", color: "#dc2626", fontWeight: 900, animation: "pulse 1.2s infinite" }}>Live</span>
            <span style={{ fontSize: "0.5rem", color: "#1a2b5e", opacity: 0.4 }}>·</span>
            <span style={{ fontSize: "0.5rem", color: "#1a2b5e", fontWeight: 500 }}>ΑΑΔΕ · ΕΦΚΑ · ΦΕΚ · ΕΡΓΑΝΗ</span>
          </div>
          {user ? (
            <button onClick={() => supabase.auth.signOut()}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, padding: "5px 10px", color: "#fff", fontSize: "0.65rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Αποσύνδεση
            </button>
          ) : (
            <button onClick={() => setShowAuthModal(true)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: orange, border: "none", borderRadius: 20, padding: "5px 12px", color: "#fff", fontSize: "0.65rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, boxShadow: "0 2px 6px rgba(232,98,42,0.4)" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Σύνδεση
            </button>
          )}
        </div>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onAuthSuccess={(u) => { setUser(u); setShowAuthModal(false); }} />}

      {/* Features Modal */}
      {showFeatures && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", maxHeight: "90vh", overflowY: "auto" }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔒</div>
            <h2 style={{ color: "#1a2b5e", fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>Έχεις χρησιμοποιήσει τις 3 δωρεάν ερωτήσεις</h2>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: 24, lineHeight: 1.6 }}>
              Κάνε δωρεάν εγγραφή για να συνεχίσεις να χρησιμοποιείς το TaxIQ απεριόριστα!
            </p>
            <button onClick={() => { setShowRegWall(false); setShowAuthModal(true); }}
              style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #e8622a, #c94d1a)", border: "none", borderRadius: 12, color: "#fff", fontSize: "1rem", fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              🎉 Δωρεάν Εγγραφή
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
          <div style={{ display: "inline-flex", alignItems: "center", background: "#E8622A", borderRadius: 50, padding: "9px 22px", boxShadow: "0 4px 15px rgba(232,98,42,0.4)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff", whiteSpace: "nowrap" }}>Η <span style={{ fontWeight: 900 }}>#1</span> Πλατφόρμα AI Λογιστικών Συμβουλών</span>
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
            <h2 style={{ color: "#fff", fontSize: "1.6rem", fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Καλώς ήρθατε στο Tax<span style={{ color: orange }}>IQ</span></h2>
            <p style={{ color: "#94a3b8", fontSize: "0.95rem", maxWidth: 480, margin: "0 auto 24px" }}>
              Ρωτήστε οτιδήποτε για Φορολογικά, Ασφαλιστικά, Λογιστικά και Εργατικά Θέματα. Real-Time Ενημερώσεις!
            </p>

            {/* Stats cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 560, margin: "0 auto 24px" }}>
              {[
                { value: "10.000+", label: "Ερωτήσεις Απαντήθηκαν" },
                { value: "Real-Time", label: "Ενημέρωση Νομοθεσίας" },
                { value: "4,8/5", label: "Μέση Αξιολόγηση" },
                { value: "98%", label: "Ακρίβεια Απαντήσεων" },
              ].map((stat, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(91,184,196,0.15)", borderRadius: 16, padding: "18px 16px", textAlign: "center", backdropFilter: "blur(8px)" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: i % 2 === 0 ? orange : teal, letterSpacing: "-0.02em", marginBottom: 4 }}>{stat.value}</div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", letterSpacing: "0.04em" }}>{stat.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 600, margin: "0 auto" }}>
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
            <div style={{ maxWidth: 600, margin: "28px auto 0", display: "flex", gap: 10, alignItems: "center" }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ρωτήστε τον AI Βοηθό σας..."
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

            {/* Feature cards */}
            <div style={{ maxWidth: 600, margin: "28px auto 0", display: "flex", flexDirection: "column", gap: 12 }}>
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
              ].map((f, i) => (
                <div key={i} style={{ background: "#ffffff", border: "1px solid rgba(26,43,94,0.1)", borderRadius: 16, padding: "18px 20px", textAlign: "left", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 10 }}>{f.icon}</svg>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1a2b5e", marginBottom: 5 }}>{f.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: 1.55 }}>{f.desc}</div>
                </div>
              ))}
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
              <p style={{ color: "#64748b", fontSize: "0.78rem", marginBottom: 20, textAlign: "center" }}>Χιλιάδες εργαζόμενοι, επαγγελματίες και επιχειρήσεις εμπιστεύονται το TaxIQ</p>
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
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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

            {/* Full Footer */}
            <div style={{ marginTop: 48, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 40, paddingBottom: 24 }}>
              
              {/* Footer columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 32, marginBottom: 40, maxWidth: 900, margin: "0 auto 40px" }}>
                
                {/* Brand column */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <TaxIQLogo size={32} />
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.1rem" }}>Tax<span style={{ color: "#E8622A" }}>IQ</span></span>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem", lineHeight: 1.7, margin: 0 }}>
                    Άμεσες απαντήσεις για Φορολογικά, Ασφαλιστικά και Εργατικά θέματα.
                  </p>
                </div>

                {/* Προϊόν */}
                <div>
                  <h4 style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700, marginBottom: 14, letterSpacing: "0.05em" }}>Προϊόν</h4>
                  {["Χαρακτηριστικά", "Τιμές", "Συχνές Ερωτήσεις", "Οδηγός Χρήσης"].map(item => (
                    <div key={item} style={{ marginBottom: 8 }}>
                      <a href="#" onClick={e => { e.preventDefault(); if(item === "Χαρακτηριστικά") setShowFeatures(true); }}
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
                    { label: "Σχετικά", href: "#" },
                    { label: "Επικοινωνία", href: "#" },
                    { label: "logistis-online.gr", href: "https://www.logistis-online.gr" },
                  ].map(item => (
                    <div key={item.label} style={{ marginBottom: 8 }}>
                      <a href={item.href} target={item.href !== "#" ? "_blank" : "_self"} rel="noopener noreferrer"
                        style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", textDecoration: "none" }}
                        onMouseEnter={e => e.target.style.color = "#E8622A"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.55)"}>{item.label}</a>
                    </div>
                  ))}
                </div>

                {/* Νομικά */}
                <div>
                  <h4 style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700, marginBottom: 14, letterSpacing: "0.05em" }}>Νομικά</h4>
                  {["Όροι Χρήσης", "Πολιτική Απορρήτου", "Πολιτική Cookies", "GDPR"].map(item => (
                    <div key={item} style={{ marginBottom: 8 }}>
                      <a href="#" style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", textDecoration: "none" }}
                        onMouseEnter={e => e.target.style.color = "#E8622A"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.55)"}>{item}</a>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom bar */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, maxWidth: 900, margin: "0 auto" }}>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", margin: 0 }}>
                  © {new Date().getFullYear()} TaxIQ. Με την επιφύλαξη παντός δικαιώματος. · Powered by{" "}
                  <a href="https://www.logistis-online.gr" target="_blank" rel="noopener noreferrer"
                    style={{ color: "#E8622A", textDecoration: "none", fontWeight: 600 }}>logistis-online.gr</a>
                </p>
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.62rem", margin: 0, textAlign: "right" }}>
                  Το περιεχόμενο έχει ενημερωτικό χαρακτήρα και δεν αποτελεί επαγγελματική συμβουλή.
                </p>
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
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(91,184,196,0.2); border-radius: 2px; }
        textarea::placeholder { color: #475569; }
      `}</style>
    </div>
  );
}
