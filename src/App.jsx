import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Calculator, TrendingUp, Download, Info, AlertTriangle, Calendar, Clock, Receipt, Settings, RefreshCw, LayoutDashboard, CheckSquare, Square, ExternalLink, LogOut, BarChart3, PieChart as PieChartIcon, ShieldCheck, Printer, Landmark, Copy, Briefcase, BookOpen, Sun, Moon } from 'lucide-react';
import { calculateTax, projectAnnual, getTaxTrapAdvice, calculateOvertime, recommendTaxCode, parseTaxCode } from './logic/TaxCalculator';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell, PieChart, Pie, LineChart, Line } from 'recharts';
import AuthModal from './AuthModal';
import SelfEmployedTab from './SelfEmployedTab';
import GuideTab from './GuideTab';
import AiAssistant from './AiAssistant';
import { calculateSEProfit, calculateMileageAllowance, calculateSelfAssessment } from './logic/SelfAssessmentCalculator';

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

const DonutChart = ({ data }) => {
  const total = data.reduce((s, i) => s + i.value, 0);
  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <svg viewBox="-1 -1 2 2" style={{ transform: 'rotate(-90deg)', width: '100%', maxWidth: '200px', margin: '0 auto', display: 'block' }}>
      {data.map((slice, i) => {
        const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
        cumulativePercent += slice.value / total;
        const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
        const largeArcFlag = slice.value / total > 0.5 ? 1 : 0;
        const pathData = [
          `M ${startX} ${startY}`,
          `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
          `L 0 0`,
        ].join(' ');
        return <path key={i} d={pathData} fill={slice.color} stroke="var(--bg-dark)" strokeWidth="0.01" />;
      })}
      <circle cx="0" cy="0" r="0.6" fill="var(--bg-dark)" />
    </svg>
  );
};

function App() {
  // --- UI State ---
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, overtime, config
  const [otFilterClaimed, setOtFilterClaimed] = useState('all'); // all, claimed, unclaimed
  const [otFilterMonth, setOtFilterMonth] = useState('all');

  // --- Persistent State ---
  const [taxCode, setTaxCode] = useState('1257L');
  const [baseSalary, setBaseSalary] = useState(45000);
  const [contractedHours, setContractedHours] = useState(37.5);
  const [pensionPercent, setPensionPercent] = useState(5);
  const [pensionType, setPensionType] = useState('standard'); // 'standard' | 'salary_sacrifice'
  const [taxYear, setTaxYear] = useState('2025/26');
  const [studentLoanPlans, setStudentLoanPlans] = useState([]); // plan1, plan2, plan4, plan5, pgl
  const [childBenefitCount, setChildBenefitCount] = useState(0);
  const [holidaySupplementPercent, setHolidaySupplementPercent] = useState(8.3);

  const [sandboxMode, setSandboxMode] = useState(false);
  const [sandboxSalary, setSandboxSalary] = useState(null);
  const [sandboxPension, setSandboxPension] = useState(null);
  const [sandboxOvertime, setSandboxOvertime] = useState(null);
  const [sandboxSacrifice, setSandboxSacrifice] = useState(null);
  const [sandboxSEProfit, setSandboxSEProfit] = useState(null);
  const [sandboxSipp, setSandboxSipp] = useState(null);
  const [sandboxGiftAid, setSandboxGiftAid] = useState(null);
  const [sandboxSEAllowance, setSandboxSEAllowance] = useState(null);

  const [baseEnhancements, setBaseEnhancements] = useState([]);
  const [baseSacrifices, setBaseSacrifices] = useState([]);

  // --- Self-Employment State ---
  const [workMode, setWorkMode] = useState('paye'); // 'paye' | 'se' | 'both'
  const [seData, setSEData] = useState({ months: Array(12).fill(null).map(() => ({ invoices: [], expenses: [], mileage: [] })), vatRegistered: false, useTradingAllowance: false });

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [months, setMonths] = useState(Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));

  // --- Tour State ---
  const [sourceYearForCopy, setSourceYearForCopy] = useState('2024/25');
  const [targetYearForCopy, setTargetYearForCopy] = useState('2025/26');
  const [tourStep, setTourStep] = useState(null);
  const [showOtModal, setShowOtModal] = useState(false);
  const [otModalData, setOtModalData] = useState({ monthIdx: selectedMonthIdx, hours: '', multiplier: 1.5, reason: '', date: new Date().toISOString().split('T')[0] });

  const [showBaseModifierModal, setShowBaseModifierModal] = useState(false);
  const [baseModifierModalData, setBaseModifierModalData] = useState({ id: null, type: 'enhancement', name: '', amount: '', frequency: 'monthly', sacrificeType: 'salary_sacrifice' });
  // null or index
  const [hasCompletedTour, setHasCompletedTour] = useState(true); // default true, set false on new profiles

  // --- Theme State ---
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // --- Persistence Logic (v17.0 - Firebase Cloud Sync) ---
  const [currentUser, setCurrentUser] = useState(undefined); // undefined = loading, null = logged out
  const [profiles, setProfiles] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);

  const DEFAULT_PROFILE = (year) => ({
    taxCode: '1257L', baseSalary: 45000, contractedHours: 37.5,
    pensionPercent: 5, pensionType: 'standard', holidaySupplementPercent: 8.3,
    studentLoanPlans: [], childBenefitCount: 0,
    baseEnhancements: [], baseSacrifices: [],
    geminiApiKey: '',
    months: Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })),
    workMode: 'paye',
    seData: { months: Array(12).fill(null).map(() => ({ invoices: [], expenses: [], mileage: [] })), assets: [], vatRegistered: false, useTradingAllowance: false },
    hasCompletedTour: false
  });

  const applyProfile = (prof) => {
    setTaxCode(prof.taxCode || '1257L');
    setBaseSalary(prof.baseSalary || 45000);
    setContractedHours(prof.contractedHours || 37.5);
    setPensionPercent(prof.pensionPercent !== undefined ? prof.pensionPercent : 5);
    setPensionType(prof.pensionType || 'standard');
    setHolidaySupplementPercent(prof.holidaySupplementPercent !== undefined ? prof.holidaySupplementPercent : 8.3);
    setStudentLoanPlans(prof.studentLoanPlans || []);
    setChildBenefitCount(prof.childBenefitCount || 0);
    setBaseEnhancements(prof.baseEnhancements || []);
    setBaseSacrifices(prof.baseSacrifices || []);
    setGeminiApiKey(prof.geminiApiKey || '');
    setMonths(prof.months || Array(12).fill(null).map(() => ({ income: [], overtime: [], deductions: [] })));
    setWorkMode(prof.workMode || 'paye');
    setSEData(prof.seData || { months: Array(12).fill(null).map(() => ({ invoices: [], expenses: [], mileage: [] })), assets: [], vatRegistered: false, useTradingAllowance: false });
    setHasCompletedTour(prof.hasCompletedTour !== undefined ? prof.hasCompletedTour : true);
  };

  // Auth state listener - fires once on mount
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userDocRef);
          let loadedProfiles = {};

          if (snap.exists()) {
            loadedProfiles = snap.data().profiles || {};
          } else {
            // First login - migrate from localStorage if any
            const local = localStorage.getItem('taxTrackerDataV14_Profiles');
            if (local) {
              loadedProfiles = JSON.parse(local);
              // Save migrated data to Firestore immediately
              await setDoc(userDocRef, { profiles: loadedProfiles }, { merge: true });
            }
          }

          // Ensure both years have profile
          if (!loadedProfiles['2025/26']) loadedProfiles['2025/26'] = DEFAULT_PROFILE('2025/26');
          if (!loadedProfiles['2024/25']) loadedProfiles['2024/25'] = DEFAULT_PROFILE('2024/25');

          setProfiles(loadedProfiles);
          setTaxYear('2025/26'); // Always start on the current tax year
          applyProfile(loadedProfiles['2025/26']);
          setIsLoaded(true);
        } catch (e) {
          console.error("Load error:", e);
          setIsLoaded(true);
        }
      } else {
        // Logged out - reset state
        setIsLoaded(false);
        setProfiles({});
        // Apply a default profile for anonymous use
        applyProfile(DEFAULT_PROFILE('2025/26'));
      }
    });

    return () => unsub();
  }, []);

  // Trigger tour if not completed
  useEffect(() => {
    if (isLoaded && currentUser && !hasCompletedTour && tourStep === null) {
      setTourStep(0);
    }
  }, [isLoaded, currentUser, hasCompletedTour]);

  // --- Tour Steps Definition ---
  const tourSteps = [
    {
      title: "Welcome to Tax Tracker!",
      content: "Let's take a 30-second tour to set up your profile for maximum accuracy.",
      target: null, // Center screen
      tab: 'config'
    },
    {
      title: "1. Base Salary",
      content: "Enter your annual gross salary here. This is the foundation for all calculations.",
      target: "#tour-salary",
      tab: 'config'
    },
    {
      title: "2. Mercer (Salary Sacrifice)",
      content: "If you have a Mercer pension or other Salary Sacrifice scheme, select it here to see your extra NI savings!",
      target: "#tour-pension-type",
      tab: 'config'
    },
    {
      title: "3. Advanced Analytics",
      content: "View your itemized breakdown and new timeline graphs here. It tracks your wealth, overtime trends, and tax savings!",
      target: "#tour-analytics-trigger",
      tab: 'analytics'
    },
    {
      title: "4. Overtime Tracker",
      content: "Log your extra hours here. We'll track what's unclaimed so you never miss a penny.",
      target: "#tour-ot-log",
      tab: 'overtime'
    }
  ];

  const handleNextTour = () => {
    if (tourStep < tourSteps.length - 1) {
      const nextStep = tourStep + 1;
      if (tourSteps[nextStep].tab) {
        setActiveTab(tourSteps[nextStep].tab);
      }
      setTourStep(nextStep);
    } else {
      completeTour();
    }
  };

  const completeTour = () => {
    setTourStep(null);
    setHasCompletedTour(true);
    // Persist to Firebase if possible
    if (currentUser) {
      const userDoc = doc(db, 'users', currentUser.uid);
      setDoc(userDoc, { profiles: { [taxYear]: { hasCompletedTour: true } } }, { merge: true });
    }
  };

  const TourOverlay = () => {
    const step = tourSteps[tourStep];
    const [style, setStyle] = useState({});

    useEffect(() => {
      if (step && step.target) {
        const el = document.querySelector(step.target);
        if (el) {
          const rect = el.getBoundingClientRect();
          const padding = 10;
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const r = Math.max(rect.width, rect.height) / 2 + padding;

          document.documentElement.style.setProperty('--spotlight-x', `${x}px`);
          document.documentElement.style.setProperty('--spotlight-y', `${y}px`);
          document.documentElement.style.setProperty('--spotlight-r', `${r}px`);

          // Position modal
          const modalX = x > window.innerWidth / 2 ? x - 180 : x + 180;
          const modalY = y > window.innerHeight / 2 ? y - 120 : y + 120;

          // Constrain within viewport
          const finalX = Math.max(160, Math.min(window.innerWidth - 160, modalX));
          const finalY = Math.max(100, Math.min(window.innerHeight - 300, modalY));

          setStyle({
            '--modal-x': `${finalX}px`,
            '--modal-y': `${finalY}px`
          });

          el.classList.add('tour-target-highlight');
          return () => el.classList.remove('tour-target-highlight');
        }
      } else {
        // Reset spotlight to center
        document.documentElement.style.setProperty('--spotlight-x', `50%`);
        document.documentElement.style.setProperty('--spotlight-y', `50%`);
        document.documentElement.style.setProperty('--spotlight-r', `0px`);
        setStyle({ '--modal-x': '50%', '--modal-y': '50%' });
      }
    }, [tourStep]);

    if (tourStep === null || !tourSteps[tourStep]) return null;

    return (
      <div className="tour-overlay">
        <div className="glass-card tour-modal" style={style}>
          <div className="tour-step-indicator">STEP {tourStep + 1} OF {tourSteps.length}</div>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>{step.title}</h3>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.4 }}>{step.content}</p>
          <div className="tour-controls">
            <button className="btn-secondary" onClick={() => setTourStep(null)}>Skip</button>
            <button className="btn-primary" onClick={handleNextTour}>
              {tourStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Cloud save - debounced on any data change
  useEffect(() => {
    if (!isLoaded || !currentUser) return;
    const updatedProfiles = {
      ...profiles,
      [taxYear]: {
        taxCode, baseSalary, contractedHours, pensionPercent, pensionType, holidaySupplementPercent,
        taxYear, studentLoanPlans, childBenefitCount, baseEnhancements, baseSacrifices, geminiApiKey, months,
        workMode, seData, hasCompletedTour
      }
    };
    setProfiles(updatedProfiles);
    // Save to Firestore
    const docRef = doc(db, 'users', currentUser.uid);
    setDoc(docRef, { profiles: updatedProfiles }, { merge: true });
    // Also keep localStorage as offline backup
    localStorage.setItem('taxTrackerDataV14_Profiles', JSON.stringify(updatedProfiles));
  }, [taxCode, baseSalary, contractedHours, pensionPercent, pensionType, holidaySupplementPercent, studentLoanPlans, childBenefitCount, baseEnhancements, baseSacrifices, geminiApiKey, months, workMode, seData, hasCompletedTour, isLoaded]);

  // Switch Year Handler
  const handleYearSwitch = (newYear) => {
    setTaxYear(newYear);
    const activeProf = profiles[newYear];
    applyProfile(activeProf || {});
    setSandboxMode(false);
  };


  // --- Helpers ---
  const getMonthlyValue = (amount, frequency) => {
    if (frequency === 'monthly') return Number(amount) || 0;
    if (frequency === 'annual') return (Number(amount) || 0) / 12;
    if (frequency === 'hourly') return ((Number(amount) || 0) * contractedHours * 52) / 12;
    return Number(amount) || 0;
  };

  const handleNumericInput = (val, setter) => {
    if (val === '') {
      setter('');
      return;
    }
    const num = Number(val);
    if (!isNaN(num)) setter(num);
  };

  // --- Calculations ---

  // 1. Recurring Base for future projection
  const futureBaseData = useMemo(() => {
    const monthlyBaseSalary = (sandboxMode && sandboxSalary !== null ? sandboxSalary : baseSalary) / 12;
    const baseEnhancementMonthly = baseEnhancements.reduce((s, e) => s + getMonthlyValue(e.amount, e.frequency), 0);
    const grossBaseSacrificeMonthly = baseSacrifices.filter(d => d.type !== 'net_sacrifice').reduce((s, d) => s + getMonthlyValue(d.amount, d.frequency), 0) + (sandboxMode && sandboxSacrifice !== null ? sandboxSacrifice / 12 : 0);
    const netBaseSacrificeMonthly = baseSacrifices.filter(d => d.type === 'net_sacrifice').reduce((s, d) => s + getMonthlyValue(d.amount, d.frequency), 0);

    const grossForPension = monthlyBaseSalary;
    const pension = grossForPension * ((sandboxMode && sandboxPension !== null ? sandboxPension : pensionPercent) / 100);

    return {
      gross: monthlyBaseSalary + baseEnhancementMonthly + (sandboxMode && sandboxOvertime !== null ? sandboxOvertime / 12 : 0),
      pension: pension,
      grossSacrifice: grossBaseSacrificeMonthly,
      netSacrifice: netBaseSacrificeMonthly,
      taxFree: 0
    };
  }, [baseSalary, baseEnhancements, baseSacrifices, pensionPercent, contractedHours, sandboxMode, sandboxSalary, sandboxPension, sandboxOvertime, sandboxSacrifice]);

  // 2. Prepare Actual Month Data (April to selected month)
  const monthsActualData = useMemo(() => {
    const monthlyBaseSalary = (sandboxMode && sandboxSalary !== null ? sandboxSalary : baseSalary) / 12;
    const sandboxOtMonthly = (sandboxMode && sandboxOvertime !== null ? sandboxOvertime / 12 : 0);

    return months.map((m, monthIdx) => {
      const ot15 = m.overtime.filter(o => o.claimed && o.multiplier === 1.5).reduce((s, o) => s + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0);
      const ot20 = m.overtime.filter(o => o.claimed && o.multiplier === 2.0).reduce((s, o) => s + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0);
      const otTotal = ot15 + ot20 + sandboxOtMonthly;

      const holidaySupplementAmount = otTotal > 0 ? (otTotal * (holidaySupplementPercent / 100)) : 0;

      const varGrossIncome = m.income.reduce((s, i) => s + (Number(i.amount) || 0), 0) + m.deductions.filter(d => d.type === 'income').reduce((s, d) => s + (Number(d.amount) || 0), 0) + holidaySupplementAmount;

      const baseEnhancementMonthlyTotal = baseEnhancements.reduce((s, e) => s + getMonthlyValue(e.amount, e.frequency), 0);
      const totalMonthlyGrossForPension = monthlyBaseSalary;
      const pension = totalMonthlyGrossForPension * ((sandboxMode && sandboxPension !== null ? sandboxPension : pensionPercent) / 100);

      const varTaxFree = m.deductions.filter(d => d.type === 'tax_free').reduce((s, d) => s + (Number(d.amount) || 0), 0);

      // Map recurring items into specific lines
      const mappedEnhancements = baseEnhancements.map(e => ({ name: e.name || 'Enhancement', amount: getMonthlyValue(e.amount, e.frequency) }));
      const mappedSacrifices = baseSacrifices.map(s => ({ name: s.name || 'Sacrifice', amount: getMonthlyValue(s.amount, s.frequency), type: s.type }));

      // Add sandbox sacrifice if exists
      if (sandboxMode && sandboxSacrifice > 0) {
        mappedSacrifices.push({ name: 'Sandbox Exp.', amount: sandboxSacrifice / 12, type: 'salary_sacrifice' });
      }

      const otRows = [{ name: 'Overtime', amount: otTotal }];
      if (holidaySupplementAmount > 0) {
        otRows.push({ name: `OT Holiday Supp. (${holidaySupplementPercent}%)`, amount: holidaySupplementAmount });
      }

      return {
        month: MONTHS[monthIdx],
        monthIdx: monthIdx,
        gross: monthlyBaseSalary + baseEnhancementMonthlyTotal + otTotal + varGrossIncome,
        ot: otTotal,
        ot15,
        ot20,
        holidaySupplement: holidaySupplementAmount,
        pension: pension,
        taxFree: varTaxFree,
        incomeItems: mappedEnhancements,
        deductionItems: mappedSacrifices,
        rawMonthsActual: m
      };
    });
  }, [months, baseSalary, contractedHours, pensionPercent, baseEnhancements, baseSacrifices, holidaySupplementPercent, sandboxMode, sandboxSalary, sandboxPension, sandboxOvertime, sandboxSacrifice]);

  // 3. Analytics & Projections Data
  const analyticsData = useMemo(() => {
    // Current trajectory (Projected Annual)
    const options = {
      taxYear,
      studentLoanPlans,
      childBenefitCount,
      pensionIsSS: pensionType === 'salary_sacrifice'
    };

    const currentProjected = projectAnnual(monthsActualData, futureBaseData, selectedMonthIdx, taxCode, options);

    // --- SE Integration ---
    let seProfitAmt = 0;
    let seSABill = 0;
    let totalMiles = 0;
    let totalSEInvoicedIncome = 0;
    let totalSEExpenses = 0;
    let seSipp = sandboxMode ? (sandboxSipp || 0) : 0;
    let seGiftAid = sandboxMode ? (sandboxGiftAid || 0) : 0;

    if (workMode !== 'paye' || sandboxMode) {
      if (sandboxMode && sandboxSEProfit !== null) {
        seProfitAmt = sandboxSEProfit;
      } else {
        seData.months.forEach(m => {
          (m.invoices || []).forEach(inv => { if (inv.paid) totalSEInvoicedIncome += Number(inv.amount || 0); });
          (m.expenses || []).forEach(exp => { totalSEExpenses += Number(exp.amount || 0); });
          (m.mileage || []).forEach(ml => { totalMiles += Number(ml.miles || 0); });
        });

        const mileageCalc = calculateMileageAllowance(totalMiles, taxYear);
        const profitCalc = calculateSEProfit({
          grossIncome: totalSEInvoicedIncome,
          totalExpenses: totalSEExpenses,
          mileageAllowance: mileageCalc.totalAllowance,
          useTradingAllowance: sandboxMode ? sandboxSEAllowance : seData.useTradingAllowance,
          taxYear
        });
        seProfitAmt = profitCalc.profit;
      }

      const sa = calculateSelfAssessment({
        payeANI: currentProjected.taxableIncome,
        payeIncomeTaxPaid: currentProjected.incomeTax,
        seProfit: seProfitAmt,
        taxCode,
        taxYear,
        sipp: seSipp,
        giftAid: seGiftAid,
        studentLoanPlans,
        payeStudentLoanPaid: currentProjected.studentLoan
      });
      seSABill = sa.totalSABill;
    }

    // Baseline (No Sacrifices - for comparison)
    // We assume sacrifice is 0 and pension is standard Relief at Source (not SS)
    const baselineOptions = { ...options, pensionIsSS: false, omitAllSacrifice: true };
    const baselineProjected = projectAnnual(monthsActualData, futureBaseData, selectedMonthIdx, taxCode, baselineOptions);

    const taxSaved = Math.max(0, baselineProjected.incomeTax - currentProjected.incomeTax);
    const niSaved = Math.max(0, baselineProjected.ni - currentProjected.ni);

    // Per-item marginal savings
    const sacrificeItemsSavings = [];

    // 1. Pension
    if (pensionType === 'salary_sacrifice' && currentProjected.pensionContribution > 0) {
      const withoutPensionOptions = { ...options, pensionIsSS: false, omitAllPension: true };
      const withoutPensionProj = projectAnnual(monthsActualData, futureBaseData, selectedMonthIdx, taxCode, withoutPensionOptions);
      sacrificeItemsSavings.push({
        name: 'Pension (Mercer SS)',
        amount: currentProjected.pensionContribution,
        taxSaved: Math.max(0, withoutPensionProj.incomeTax - currentProjected.incomeTax),
        niSaved: Math.max(0, withoutPensionProj.ni - currentProjected.ni)
      });
    }

    // 2. Base Sacrifices
    baseSacrifices.filter(s => s.type !== 'net_sacrifice').forEach(s => {
      const annualItemAmount = getMonthlyValue(s.amount, s.frequency) * 12;
      // We estimate marginal saving by omitting this specific amount
      const withoutThisItemOptions = { ...options, omitSpecificSacrificeAmount: (annualItemAmount / 12) };
      const withoutThisItemProj = projectAnnual(monthsActualData, futureBaseData, selectedMonthIdx, taxCode, withoutThisItemOptions);

      sacrificeItemsSavings.push({
        name: s.name || 'Sacrifice',
        amount: annualItemAmount,
        taxSaved: Math.max(0, withoutThisItemProj.incomeTax - currentProjected.incomeTax),
        niSaved: Math.max(0, withoutThisItemProj.ni - currentProjected.ni)
      });
    });

    // Monthly Timeline (Cumulative UK Tax Logic)
    let ytdGross = 0;
    let ytdPension = 0;
    let ytdTaxPaid = 0;

    const timeline = monthsActualData.map((m, i) => {
      const currentTaxCode = m.rawMonthsActual.taxCodeOverride || taxCode;

      // Calculate non-cumulative items (NI, SL, HICBC) on purely this month's pay
      const monthResult = calculateTax(m.gross * 12, m.pension * 12, 0, currentTaxCode, 0, options);

      // Calculate cumulative Income Tax
      ytdGross += m.gross;
      ytdPension += m.pension;

      const annualizedYtdGross = (ytdGross / (i + 1)) * 12;
      const annualizedYtdPension = (ytdPension / (i + 1)) * 12;

      const ytdResults = calculateTax(annualizedYtdGross, annualizedYtdPension, 0, currentTaxCode, 0, options);

      // Target YTD tax: total tax due on annualized YTD, divided by 12, multiplied by months elapsed
      const targetYtdTax = (ytdResults.incomeTax / 12) * (i + 1);

      // Tax to pay THIS month is the difference between target YTD tax and what we've already paid
      const taxThisMonth = targetYtdTax - ytdTaxPaid;
      ytdTaxPaid += taxThisMonth;

      const nonCumulativeTax = monthResult.incomeTax / 12;
      const accurateNet = (monthResult.annualTakeHome / 12) + nonCumulativeTax - taxThisMonth + m.taxFree;

      return {
        name: m.month.substring(0, 3),
        gross: m.gross,
        net: accurateNet,
        tax: taxThisMonth,
        ni: monthResult.ni / 12,
        sl: monthResult.studentLoan / 12,
        hicbc: monthResult.hicbc / 12,
        ot: m.ot,
        pension: m.pension
      };
    });

    // Universal Advisory & Tax Pot
    const recommendedCode = recommendTaxCode(currentProjected.taxableIncome);
    const recommendedResults = calculateTax(currentProjected.gross, currentProjected.pensionContribution, currentProjected.salarySacrifice, recommendedCode, currentProjected.netDeductions, options);
    const payeUnderpayment = Math.max(0, recommendedResults.incomeTax - currentProjected.incomeTax);

    // Tax Pot Calculation (Monthly Set Aside)
    // 1. SE Tax + NI
    const seMonthlyTaxPot = seSABill / 12;
    // 2. PAYE Underpayment (Spread over remaining months or full year)
    const monthsRemaining = 12 - (selectedMonthIdx + 1);
    const payeMonthlyShortfall = payeUnderpayment / (monthsRemaining > 0 ? monthsRemaining : 12);

    const totalMonthlyTaxPot = Math.max(0, seMonthlyTaxPot + payeMonthlyShortfall);

    // Marriage Allowance
    const isMarriageAllowanceLikely = (currentProjected.gross + seProfitAmt) > 12570 && (currentProjected.gross + seProfitAmt) < 50270;

    const isCodeMismatch = taxCode.toUpperCase().trim() !== recommendedCode.toUpperCase().trim();

    return {
      timeline,
      projections: currentProjected,
      seProfit: seProfitAmt,
      seSABill: seSABill,
      seSipp,
      seGiftAid,
      totalTaxNI: currentProjected.totalTaxNI + seSABill,
      totalTakeHome: currentProjected.annualTakeHome + seProfitAmt - seSABill + currentProjected.projectedTaxFree,
      sacrificeItemsSavings,
      payeUnderpayment,
      totalMonthlyTaxPot,
      isMarriageAllowanceLikely,
      isCodeMismatch,
      recommendedCode: recommendedCode,
      savings: {
        tax: taxSaved,
        ni: niSaved,
        total: taxSaved + niSaved
      }
    };
  }, [monthsActualData, futureBaseData, selectedMonthIdx, taxCode, taxYear, studentLoanPlans, childBenefitCount, pensionType, months, workMode, seData, sandboxMode, sandboxSalary, sandboxPension, sandboxOvertime, sandboxSacrifice, sandboxSEProfit, sandboxSEAllowance, sandboxSipp, sandboxGiftAid]);

  // Analytics Tab Component
  const AnalyticsTab = () => {
    const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#8b5cf6'];
    const pieData = [
      { name: 'Take Home', value: analyticsData.totalTakeHome, color: '#6366f1' },
      { name: 'Income Tax', value: analyticsData.projections.incomeTax + analyticsData.seSABill, color: '#f43f5e' },
      { name: 'Nat. Insurance', value: analyticsData.projections.ni, color: '#fbbf24' },
      { name: 'Pension', value: analyticsData.projections.pensionContribution, color: '#10b981' }
    ];

    return (
      <div className="analytics-view">
        <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
          {/* Projections Card */}
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} color="var(--primary)" /> Year-End Forecast ({taxYear})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div>
                <div className="stat-label">Total Gross Income</div>
                <div className="stat-value">£{(analyticsData.projections.gross + (analyticsData.seProfit / (seData.useTradingAllowance ? 1 : 1))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem' }}>
                  PAYE: £{analyticsData.projections.gross.toLocaleString()} | SE: £{analyticsData.seProfit.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="stat-label">Total Effective Tax</div>
                <div className="stat-value" style={{ color: 'var(--error)' }}>£{analyticsData.totalTaxNI.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '0.25rem' }}>
                  PAYE IT/NI: £{analyticsData.projections.totalTaxNI.toLocaleString()} | SA Bill: £{analyticsData.seSABill.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="stat-label">Total Annual Net</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>£{analyticsData.totalTakeHome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="stat-label">Overall Tax Rate</div>
                <div className="stat-value" style={{ color: 'var(--warning)' }}>
                  {((analyticsData.totalTaxNI / (analyticsData.projections.gross + analyticsData.seProfit)) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="stat-card">
                <label className="stat-label">Pension Pot Growth</label>
                <div className="stat-value" style={{ color: 'var(--success)' }}>£{analyticsData.projections.pensionContribution.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          </div>

          {/* Detailed Sacrifice Savings Breakdown */}
          <div className="glass-card" style={{ gridColumn: '1 / -1', border: '1px solid var(--success)', background: 'rgba(16, 185, 129, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} /> Detailed Sacrifice Savings (Marginal)
              </h3>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Total Annual Saving</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--success)' }}>£{analyticsData.savings.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {analyticsData.sacrificeItemsSavings.length > 0 ? (
                analyticsData.sacrificeItemsSavings.map((item, idx) => (
                  <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.75rem', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>{item.name}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ opacity: 0.6 }}>Contribution:</span>
                        <span>£{item.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ opacity: 0.6 }}>Income Tax Saved:</span>
                        <span style={{ color: 'var(--success)' }}>+£{item.taxSaved.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ opacity: 0.6 }}>NI Saved:</span>
                        <span style={{ color: 'var(--success)' }}>+£{item.niSaved.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--glass-border)', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>Total Benefit:</span>
                        <span style={{ fontSize: '1.1rem' }}>£{(item.taxSaved + item.niSaved).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                  No salary sacrifice items detected. Set them in the Config tab to see savings.
                </div>
              )}
            </div>
          </div>

          {/* Monthly Timeline */}
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ margin: '0 0 1.5rem 0' }}>Income vs. Deductions (Monthly)</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={analyticsData.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150, 150, 150, 0.2)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-main)" fontSize={12} opacity={0.6} />
                <YAxis stroke="var(--text-main)" fontSize={12} opacity={0.6} tickFormatter={(v) => `£${v / 1000}k`} />
                <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }} cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} />
                <Legend />
                <Bar dataKey="net" name="Net Pay" stackId="a" fill="var(--primary)" />
                <Bar dataKey="tax" name="Income Tax" stackId="a" fill="#f43f5e" />
                <Bar dataKey="ni" name="Nat. Insurance" stackId="a" fill="#fbbf24" />
                <Bar dataKey="sl" name="Student Loan" stackId="a" fill="#06b6d4" />
                <Bar dataKey="pension" name="Pension" stackId="a" fill="#10b981" />
                <Bar dataKey="hicbc" name="HICBC" stackId="a" fill="#6b7280" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Overtime Tracker */}
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ margin: '0 0 1.5rem 0' }}>Overtime History (£)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analyticsData.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150, 150, 150, 0.2)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-main)" fontSize={12} opacity={0.6} />
                <YAxis stroke="var(--text-main)" fontSize={12} opacity={0.6} />
                <Tooltip cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-main)' }} />
                <Bar dataKey="ot" name="Overtime" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Marriage Allowance Advisor (Moved here) */}
          {analyticsData.isMarriageAllowanceLikely && (
            <div className="glass-card" style={{ gridColumn: '1 / -1', border: '1px solid var(--success)', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, transparent 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
                    <ShieldCheck size={20} /> Marriage Allowance Advisor
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.8 }}>
                    Your income levels suggest you could benefit from Marriage Allowance. You can transfer £1,260 of your Personal Allowance to your partner if they earn less than you.
                  </p>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem 1.5rem', borderRadius: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.25rem' }}>Potential Saving</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>£252<span style={{ fontSize: '0.9rem', opacity: 0.6 }}>/yr</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 3. Projections
  const projection = projectAnnual(monthsActualData, futureBaseData, selectedMonthIdx, taxCode, {
    taxYear,
    studentLoanPlans,
    childBenefitCount,
    pensionIsSS: pensionType === 'salary_sacrifice'
  });

  // 4. Current Selected Month Summary Logic
  const currentMonthFull = monthsActualData[selectedMonthIdx];
  const monthlyGross = currentMonthFull.gross;
  const monthlyPension = currentMonthFull.pension;
  const monthlyGrossSacrifice = currentMonthFull.deductionItems.filter(d => d.type === 'salary_sacrifice').reduce((s, i) => s + Number(i.amount || 0), 0) + currentMonthFull.rawMonthsActual.deductions.filter(d => d.type === 'salary_sacrifice').reduce((s, i) => s + Number(i.amount || 0), 0);
  const monthlyNetSacrifice = currentMonthFull.deductionItems.filter(d => d.type === 'net_sacrifice').reduce((s, i) => s + Number(i.amount || 0), 0) + currentMonthFull.rawMonthsActual.deductions.filter(d => d.type === 'net_sacrifice').reduce((s, i) => s + Number(i.amount || 0), 0);

  const monthlyResultsAnnualized = calculateTax(
    monthlyGross * 12,
    monthlyPension * 12,
    monthlyGrossSacrifice * 12,
    taxCode,
    monthlyNetSacrifice * 12,
    { taxYear, studentLoanPlans, childBenefitCount, pensionIsSS: pensionType === 'salary_sacrifice' }
  );

  // v20.8 Breakdown Totals
  const totalPreTax = monthlyGrossSacrifice + (pensionType === 'salary_sacrifice' ? monthlyPension : 0);
  const totalStatutory = (monthlyResultsAnnualized.incomeTax / 12) + (monthlyResultsAnnualized.ni / 12) + (monthlyResultsAnnualized.studentLoan / 12) + (monthlyResultsAnnualized.hicbc / 12) + (pensionType !== 'salary_sacrifice' ? monthlyPension : 0);
  const totalPostTax = monthlyNetSacrifice;

  const totalMonthlyNet = (monthlyResultsAnnualized.annualTakeHome / 12) + currentMonthFull.taxFree;

  const chartData = [
    { name: 'Net Pay', value: monthlyResultsAnnualized.annualTakeHome / 12, color: 'var(--success)' },
    { name: 'Income Tax', value: monthlyResultsAnnualized.incomeTax / 12, color: 'var(--error)' },
    { name: 'NI', value: monthlyResultsAnnualized.ni / 12, color: '#f59e0b' },
    { name: 'Student Loan', value: monthlyResultsAnnualized.studentLoan / 12, color: '#06b6d4' },
    { name: 'Pension', value: monthlyResultsAnnualized.pensionContribution / 12, color: 'var(--primary)' },
    { name: 'Other', value: monthlyResultsAnnualized.hicbc / 12 + monthlyResultsAnnualized.netDeductions / 12, color: '#6b7280' }
  ].filter(i => i.value > 0);

  // Overtime Processing
  const allOvertime = useMemo(() => {
    return months.flatMap((m, idx) => m.overtime.map(o => ({ ...o, monthIdx: idx, monthName: MONTHS[idx] })));
  }, [months]);

  const ytdOTTotal = allOvertime.reduce((acc, o) => acc + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0);

  const filteredOT = allOvertime.filter(o => {
    if (otFilterClaimed === 'claimed' && !o.claimed) return false;
    if (otFilterClaimed === 'unclaimed' && o.claimed) return false;
    if (otFilterMonth !== 'all' && Number(otFilterMonth) !== o.monthIdx) return false;
    return true;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Tax Recommendation
  const recommendedCode = recommendTaxCode(projection.taxableIncome);
  const isCodeCorrect = taxCode.toUpperCase().trim() === recommendedCode.toUpperCase().trim();
  const trapAdvice = getTaxTrapAdvice(projection.taxableIncome, pensionPercent, baseSalary, taxCode);

  // --- Handlers ---
  const addBaseItem = (type) => {
    const newItem = { id: Date.now().toString(), name: 'New Item', amount: '', frequency: 'monthly', type: type === 'sacrifice' ? 'salary_sacrifice' : 'income' };
    if (type === 'enhancement') setBaseEnhancements([...baseEnhancements, newItem]);
    else setBaseSacrifices([...baseSacrifices, newItem]);
  };

  const updateBaseItem = (type, id, field, val) => {
    const list = type === 'enhancement' ? [...baseEnhancements] : [...baseSacrifices];
    const updated = list.map(i => i.id === id ? { ...i, [field]: val } : i);
    if (type === 'enhancement') setBaseEnhancements(updated);
    else setBaseSacrifices(updated);
  };

  const removeBaseItem = (type, id) => {
    if (type === 'enhancement') setBaseEnhancements(baseEnhancements.filter(i => i.id !== id));
    else setBaseSacrifices(baseSacrifices.filter(i => i.id !== id));
  };

  const handleCopyTaxYearData = async (sourceYear, targetYear) => {
    if (!currentUser) return;
    const confirmMessage = `Are you sure you want to copy all settings and monthly data FROM ${sourceYear} TO ${targetYear}? This will overwrite existing data for ${targetYear}.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const snap = await getDoc(userDocRef);

      if (!snap.exists()) {
        alert('Could not find your user data. Please try again.');
        return;
      }

      const allProfiles = snap.data().profiles || {};
      const sourceProfileData = allProfiles[sourceYear];

      if (!sourceProfileData) {
        alert(`No data found for the tax year ${sourceYear}. Make sure you have entered some data for that year first.`);
        return;
      }

      // Copy the source profile into the target year, keeping the taxYear field correct
      const updatedProfiles = {
        ...allProfiles,
        [targetYear]: {
          ...sourceProfileData,
          taxYear: targetYear // Ensure the target profile knows what year it belongs to
        }
      };

      await setDoc(userDocRef, { profiles: updatedProfiles }, { merge: true });
      alert(`Successfully copied data from ${sourceYear} to ${targetYear}. Page will now reload.`);
      window.location.reload();
    } catch (err) {
      console.error('Error copying tax year data:', err);
      alert('Failed to copy data. Check console for details.');
    }
  };

  const addMonthItem = (monthIdx, type) => {
    const n = [...months];
    const newItem = type === 'overtime'
      ? { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], reason: '', hours: '', multiplier: 1.5, claimed: false }
      : { id: Date.now().toString(), name: 'Item', amount: '', type: type === 'deductions' ? 'salary_sacrifice' : 'other' };
    n[monthIdx][type].push(newItem);
    setMonths(n);
  };

  const updateMonthItem = (monthIdx, type, id, field, val) => {
    const n = [...months];
    n[monthIdx][type] = n[monthIdx][type].map(i => i.id === id ? { ...i, [field]: val } : i);
    setMonths(n);
  };

  const removeMonthItem = (monthIdx, type, id) => {
    const n = [...months];
    n[monthIdx][type] = n[monthIdx][type].filter(i => i.id !== id);
    setMonths(n);
  };

  const moveOvertimeItem = (oldMonthIdx, newMonthIdx, id) => {
    if (oldMonthIdx === newMonthIdx) return;
    const itemToMove = months[oldMonthIdx].overtime.find(i => i.id === id);
    if (!itemToMove) return;

    const n = [...months];
    n[oldMonthIdx].overtime = n[oldMonthIdx].overtime.filter(i => i.id !== id);
    n[newMonthIdx].overtime.push(itemToMove);
    setMonths(n);
  };

  const clearCacheAndReload = () => {
    if (window.confirm("Perform hard reset? Your data is safe. Proceed?")) {
      navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
      window.location.reload(true);
    }
  };

  const exportToCSV = () => {
    const headers = ['Month', 'Gross Income', 'Pension', 'Salary Sacrifice', 'Tax Free Expenses', 'Net Pay'];
    const rows = monthsActualData.map((m, i) => {
      const gross = m.gross;
      const pension = m.pension;
      const sacrifice = m.deductionItems.filter(d => d.type === 'salary_sacrifice').reduce((s, item) => s + Number(item.amount || 0), 0) + m.rawMonthsActual.deductions.filter(d => d.type === 'salary_sacrifice').reduce((s, item) => s + Number(item.amount || 0), 0);
      const taxFree = m.taxFree;

      const results = calculateTax(gross * 12, pension * 12, sacrifice * 12, taxCode, 0, { taxYear, studentLoanPlans, childBenefitCount });
      const net = (results.annualTakeHome / 12) + taxFree;

      return [MONTHS[i], gross, pension, sacrifice, taxFree, net];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `TaxTracker_Monthly_Export_${taxYear.replace('/', '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportUnclaimedOT = () => {
    const headers = ['Month', 'Date', 'Reason', 'Hours', 'Multiplier', 'Estimated Value (£)'];
    const unclaimed = allOvertime.filter(o => !o.claimed);

    const rows = unclaimed.map(o => {
      return [o.monthName, o.date, `"${o.reason}"`, o.hours, o.multiplier, calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier).toFixed(2)];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `TaxTracker_Unclaimed_OT_${taxYear.replace('/', '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Show loading spinner while auth resolves
  if (currentUser === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at top, #1a1f3e 0%, #0a0d1a 100%)' }}>
        <div style={{ textAlign: 'center', opacity: 0.6 }}>
          <div style={{ width: '2rem', height: '2rem', border: '3px solid rgba(255,255,255,0.2)', borderTop: '3px solid var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show Auth modal if not logged in
  if (!currentUser) return <AuthModal />;

  return (
    <div className="app-container">
      <header style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '1rem', paddingTop: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
          <Landmark size={32} color="var(--primary)" style={{ filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.4))' }} />
          <h1 style={{
            margin: 0,
            fontSize: '2rem',
            background: 'var(--primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
            fontWeight: 800
          }}>
            TaxTracker <span style={{ fontSize: '0.8rem', letterSpacing: 'normal', fontWeight: 'normal', opacity: 0.6, WebkitTextFillColor: 'initial', color: 'var(--text-main)', verticalAlign: 'middle', marginLeft: '0.2rem' }}>v22.8</span>
          </h1>
        </div>

        <button
          onClick={() => {
            if (!sandboxMode) {
              setSandboxSalary(baseSalary);
              setSandboxPension(pensionPercent);
              // Initialize SE sandbox values
              if (workMode !== 'paye') {
                setSandboxSEProfit(analyticsData.seProfit);
                setSandboxSEAllowance(seData.useTradingAllowance);
              }
              setSandboxSipp(0);
              setSandboxGiftAid(0);
            }
            setSandboxMode(!sandboxMode);
          }}
          className={`btn-primary ${sandboxMode ? 'active' : ''}`}
          style={{
            width: '100%',
            background: sandboxMode ? 'var(--primary)' : 'var(--glass-bg)',
            color: sandboxMode ? 'white' : 'var(--text-main)',
            border: sandboxMode ? 'none' : '1px solid var(--glass-border)',
            padding: '1rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1rem',
            boxShadow: sandboxMode ? '0 0 15px rgba(99, 102, 241, 0.3)' : 'none'
          }}
        >
          <Calculator size={20} />
          <span>{sandboxMode ? 'Exit What-If Scenario Mode' : 'Enter What-If Sandbox'}</span>
        </button>
      </header>

      {sandboxMode && (
        <div className="glass-card" style={{ border: '2px dashed var(--primary)', marginBottom: '2rem', background: 'rgba(99, 102, 241, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} /> What-If Scenario Mode
            </h3>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Experimental: Changes here won't save to your main data.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div>
              <label className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Landmark size={14} /> Hypothetical Salary (£)</label>
              <input
                type="range" min={Math.max(0, baseSalary - 20000)} max={baseSalary + 50000} step={500}
                value={sandboxSalary !== null ? sandboxSalary : baseSalary}
                onChange={(e) => setSandboxSalary(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
              <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '0.4rem' }}>£{(sandboxSalary !== null ? sandboxSalary : baseSalary).toLocaleString()}</div>
            </div>
            <div>
              <label className="stat-label">Hypothetical Pension %</label>
              <input
                type="range" min={0} max={50} step={1}
                value={sandboxPension !== null ? sandboxPension : pensionPercent}
                onChange={(e) => setSandboxPension(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
              <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '0.4rem' }}>{sandboxPension !== null ? sandboxPension : pensionPercent}%</div>
            </div>
            {workMode !== 'paye' && (
              <>
                <div>
                  <label className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Briefcase size={14} /> Hypothetical SE Profit (£)</label>
                  <input
                    type="range" min={0} max={100000} step={1000}
                    value={sandboxSEProfit !== null ? sandboxSEProfit : 0}
                    onChange={(e) => setSandboxSEProfit(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)' }}
                  />
                  <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '0.4rem' }}>£{(sandboxSEProfit !== null ? sandboxSEProfit : 0).toLocaleString()}</div>
                </div>
                <div>
                  <label className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ShieldCheck size={14} /> Hypothetical SIPP (£)</label>
                  <input
                    type="range" min={0} max={40000} step={500}
                    value={sandboxSipp !== null ? sandboxSipp : 0}
                    onChange={(e) => setSandboxSipp(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)' }}
                  />
                  <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '0.4rem' }}>£{(sandboxSipp !== null ? sandboxSipp : 0).toLocaleString()}</div>
                </div>
              </>
            )}
            <div>
              <label className="stat-label">Extra Overtime (Annual £)</label>
              <input
                type="range" min={0} max={20000} step={500}
                value={sandboxOvertime !== null ? sandboxOvertime : 0}
                onChange={(e) => setSandboxOvertime(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
              <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '0.4rem' }}>£{(sandboxOvertime !== null ? sandboxOvertime : 0).toLocaleString()}</div>
            </div>
            <div>
              <label className="stat-label">Extra Sacrifice (Annual £)</label>
              <input
                type="range" min={0} max={20000} step={500}
                value={sandboxSacrifice !== null ? sandboxSacrifice : 0}
                onChange={(e) => setSandboxSacrifice(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
              <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '0.4rem' }}>£{(sandboxSacrifice !== null ? sandboxSacrifice : 0).toLocaleString()}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
              <button
                onClick={() => {
                  if (sandboxSalary !== null) setBaseSalary(sandboxSalary);
                  if (sandboxPension !== null) setPensionPercent(sandboxPension);

                  if (sandboxOvertime > 0) {
                    setBaseEnhancements([...baseEnhancements, { id: Date.now().toString() + 'ot', name: 'Sandbox OT', amount: sandboxOvertime, frequency: 'annual', type: 'income' }]);
                  }
                  if (sandboxSacrifice > 0) {
                    setBaseSacrifices([...baseSacrifices, { id: Date.now().toString() + 'sac', name: 'Sandbox Sacrifice', amount: sandboxSacrifice, frequency: 'annual', type: 'salary_sacrifice' }]);
                  }

                  setSandboxMode(false);
                }}
                className="btn-primary"
                style={{ width: '100%', padding: '0.6rem' }}
              >
                Apply to Main
              </button>
            </div>
          </div>
        </div>
      )}

      {trapAdvice.active && (
        <div className="glass-card" style={{ border: '2px solid var(--primary)', marginBottom: '2rem', background: 'var(--glass-bg)' }}>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '1rem' }}>
                <TrendingUp color="var(--primary)" />
                <strong>Sacrifice Advisor (ANI-Reduction)</strong>
              </div>
              <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>{trapAdvice.message}</p>
              <div style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <span>Excess to Sacrifice:</span>
                  <strong style={{ color: 'var(--primary)' }}>£{trapAdvice.excessAmount.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <span>Personal Allowance Lost:</span>
                  <strong style={{ color: 'var(--error)' }}>£{trapAdvice.allowanceLost.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>Potential Tax Saving:</span>
                  <strong style={{ color: 'var(--success)' }}>£{trapAdvice.potentialSaving.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div style={{ flex: '2 1 400px' }}>
              <div className="stat-label">Recommended Strategies:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem', marginTop: '0.5rem' }}>
                {trapAdvice.options.map(opt => (
                  <div key={opt.label} style={{
                    background: opt.highlight ? 'rgba(248, 113, 113, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: opt.highlight ? '1px solid var(--error)' : '1px solid var(--glass-border)',
                    padding: '0.75rem',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: opt.highlight ? 'var(--error)' : 'var(--primary)', marginBottom: '0.25rem' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{opt.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main style={{ paddingBottom: '5rem' }}>
        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            {/* Universal Advisor Card - Conditional based on mismatch/underpayment OR SE income OR Personal Allowance Trap */}
            {(analyticsData.isCodeMismatch || analyticsData.payeUnderpayment > 50 || analyticsData.seSABill > 0 || (analyticsData.projections.taxableIncome + analyticsData.seProfit > 100000)) && (
              <div className="glass-card" id="tour-advisor" style={{ gridColumn: '1 / -1', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0) 100%)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: (analyticsData.isCodeMismatch || analyticsData.payeUnderpayment > 50 || analyticsData.seSABill > 0 || (analyticsData.projections.taxableIncome + analyticsData.seProfit > 100000)) ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr', gap: '2rem' }}>
                  {/* Tax Pot Advisor - Only if mismatch/underpayment OR SE income */}
                  {(analyticsData.isCodeMismatch || analyticsData.payeUnderpayment > 50 || analyticsData.seSABill > 0) && (
                    <div>
                      <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--primary)' }}>
                        <ShieldCheck size={20} /> Smart Tax Pot Advisor
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.25rem' }}>Monthly Set-Aside</div>
                          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--warning)' }}>£{analyticsData.totalMonthlyTaxPot.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.8, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '1rem' }}>
                          <div style={{ marginBottom: '0.25rem' }}>Safe-to-Spend: <span style={{ color: 'var(--success)', fontWeight: 600 }}>£{((analyticsData.projections.annualTakeHome / 12) + (analyticsData.seProfit / 12) - analyticsData.totalMonthlyTaxPot).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span> /mo</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Covers SE tax & PAYE shortfalls</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ borderLeft: (analyticsData.isCodeMismatch || analyticsData.payeUnderpayment > 50 || analyticsData.seSABill > 0) ? '1px solid rgba(255,255,255,0.1)' : 'none', paddingLeft: (analyticsData.isCodeMismatch || analyticsData.payeUnderpayment > 50 || analyticsData.seSABill > 0) ? '1rem' : '0' }}>
                    <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--primary)' }}>
                      <AlertTriangle size={20} /> Tax Insights
                    </h3>
                    {analyticsData.payeUnderpayment > 50 || analyticsData.isCodeMismatch ? (
                      <div>
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--error)' }}>
                          ⚠️ <strong>Tax Code Issue</strong>: Your code <strong>{taxCode}</strong> {analyticsData.isCodeMismatch ? `mismatches recommended ${analyticsData.recommendedCode}` : `is under-taxing you by ~£${analyticsData.payeUnderpayment.toLocaleString()}`}.
                        </p>
                      </div>
                    ) : null}
                    {analyticsData.projections.taxableIncome + analyticsData.seProfit > 100000 && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.4rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        ⚠️ <strong>Personal Allowance Trap</strong>: Consider SIPP/Sacrifice to restore your allowance.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="glass-card" id="tour-summary">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>Monthly Summary</h2>
                <select className="input-field" style={{ width: 'auto', fontSize: '1.2rem' }} value={selectedMonthIdx} onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i} style={{ background: '#1e293b', color: 'white' }}>{m}</option>)}
                </select>
              </div>

              {/* INCOME LINES */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.45, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Payments</div>
                {currentMonthFull.incomeItems.filter(i => Number(i.amount) !== 0).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>{item.name}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>+£{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {currentMonthFull.rawMonthsActual.income.filter(i => Number(i.amount) !== 0).map((item, idx) => (
                  <div key={`raw-income-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>{item.name}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>+£{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {currentMonthFull.rawMonthsActual.deductions.filter(d => d.type === 'income' && Number(d.amount) !== 0).map((item, idx) => (
                  <div key={`raw-deduction-income-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>{item.name}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>+£{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {currentMonthFull.ot15 > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>1.5x Overtime</span>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>+£{currentMonthFull.ot15.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {currentMonthFull.ot20 > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>2.0x Overtime</span>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>+£{currentMonthFull.ot20.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {currentMonthFull.holidaySupplement > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>OT Holiday Supp. ({holidaySupplementPercent}%)</span>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>+£{currentMonthFull.holidaySupplement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  <span style={{ opacity: 0.75 }}>Base Salary</span>
                  <span style={{ color: 'var(--success)', fontWeight: 500 }}>+£{((sandboxMode && sandboxSalary !== null ? sandboxSalary : baseSalary) / 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* GROSS SACRIFICE / PRE-TAX DEDUCTION LINES */}
              {(currentMonthFull.deductionItems.filter(d => d.type === 'salary_sacrifice' && Number(d.amount) !== 0).length > 0 || currentMonthFull.rawMonthsActual.deductions.filter(d => d.type === 'salary_sacrifice' && Number(d.amount) !== 0).length > 0 || (pensionType === 'salary_sacrifice' && monthlyPension > 0)) && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.45, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Pre-Tax Deductions</div>
                  {pensionType === 'salary_sacrifice' && monthlyPension > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                      <span style={{ opacity: 0.75 }}>Pension (Mercer SS)</span>
                      <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{monthlyPension.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {currentMonthFull.deductionItems.filter(d => d.type === 'salary_sacrifice' && Number(d.amount) !== 0).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                      <span style={{ opacity: 0.75 }}>{item.name}</span>
                      <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  {currentMonthFull.rawMonthsActual.deductions.filter(d => d.type === 'salary_sacrifice' && Number(d.amount) !== 0).map((item, idx) => (
                    <div key={`raw-ss-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                      <span style={{ opacity: 0.75 }}>{item.name}</span>
                      <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* TAX / NI / STATUTORY DEDUCTIONS */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.45, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Statutory Deductions</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  <span style={{ opacity: 0.75 }}>Taxable Income</span>
                  <span style={{ fontWeight: 600 }}>£{analyticsData.projections.taxableIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {workMode !== 'paye' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>Self-Employed Profit</span>
                    <span style={{ fontWeight: 600, color: 'var(--success)' }}>+£{analyticsData.seProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <strong>Annual Take-Home</strong>
                  <strong style={{ color: 'var(--primary)' }}>£{analyticsData.totalTakeHome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                {pensionType !== 'salary_sacrifice' && monthlyPension > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>Pension (EE)</span>
                    <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{monthlyPension.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {monthlyResultsAnnualized.studentLoan > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>Student Loan</span>
                    <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{(monthlyResultsAnnualized.studentLoan / 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {monthlyResultsAnnualized.hicbc > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span style={{ opacity: 0.75 }}>HICBC (Child Benefit)</span>
                    <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{(monthlyResultsAnnualized.hicbc / 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>

              {/* NET (POST-TAX) DEDUCTIONS */}
              {(currentMonthFull.deductionItems.filter(d => d.type === 'net_sacrifice' && Number(d.amount) !== 0).length > 0 || currentMonthFull.rawMonthsActual.deductions.filter(d => d.type === 'net_sacrifice' && Number(d.amount) !== 0).length > 0) && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.45, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Post-Tax Deductions</div>
                  {currentMonthFull.deductionItems.filter(d => d.type === 'net_sacrifice' && Number(d.amount) !== 0).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                      <span style={{ opacity: 0.75 }}>{item.name}</span>
                      <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  {currentMonthFull.rawMonthsActual.deductions.filter(d => d.type === 'net_sacrifice' && Number(d.amount) !== 0).map((item, idx) => (
                    <div key={`raw-net-sac-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                      <span style={{ opacity: 0.75 }}>{item.name}</span>
                      <span style={{ color: 'var(--error)', fontWeight: 500 }}>-£{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* MONTHLY VARIABLE ITEMS INPUT */}
              <div style={{ marginBottom: '1rem' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Monthly Variables</span>
                  <button className="btn-add" onClick={() => addMonthItem(selectedMonthIdx, 'deductions')} title="Add Variable Item">
                    <Plus size={16} />
                  </button>
                </div>
                {months[selectedMonthIdx].deductions.map(d => (
                  <div key={d.id} className="income-line">
                    <input placeholder="Name" value={d.name} onChange={(e) => updateMonthItem(selectedMonthIdx, 'deductions', d.id, 'name', e.target.value)} className="input-field" />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        placeholder="Amt"
                        value={d.amount}
                        onChange={(e) => handleNumericInput(e.target.value, (v) => updateMonthItem(selectedMonthIdx, 'deductions', d.id, 'amount', v))}
                        className="input-field"
                      />
                      <select value={d.type} onChange={(e) => updateMonthItem(selectedMonthIdx, 'deductions', d.id, 'type', e.target.value)} className="input-field">
                        <option value="salary_sacrifice" style={{ background: '#1e293b' }}>Gross Sacrifice</option>
                        <option value="net_sacrifice" style={{ background: '#1e293b' }}>Net Sacrifice</option>
                        <option value="tax_free" style={{ background: '#1e293b' }}>Expense</option>
                        <option value="income" style={{ background: '#1e293b' }}>Income</option>
                      </select>
                      <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => removeMonthItem(selectedMonthIdx, 'deductions', d.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* MID-YEAR TAX CODE OVERRIDE */}
              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--glass-bg)', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={!!months[selectedMonthIdx].taxCodeOverride}
                    onChange={(e) => {
                      const newMonths = [...months];
                      if (e.target.checked) newMonths[selectedMonthIdx].taxCodeOverride = taxCode;
                      else delete newMonths[selectedMonthIdx].taxCodeOverride;
                      setMonths(newMonths);
                    }}
                  />
                  Override Tax Code for {MONTHS[selectedMonthIdx]} onwards (Cumulative change)
                </label>
                {months[selectedMonthIdx].taxCodeOverride !== undefined && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', opacity: 0.8, color: 'var(--text-main)' }}>New Code active this month:</span>
                    <input
                      className="input-field"
                      style={{ width: '100px', padding: '0.4rem', border: '1px solid var(--primary)' }}
                      value={months[selectedMonthIdx].taxCodeOverride}
                      onChange={(e) => {
                        const newMonths = [...months];
                        newMonths[selectedMonthIdx].taxCodeOverride = e.target.value.toUpperCase();
                        setMonths(newMonths);
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', opacity: 0.6 }}>
                  <span>Total Gross</span>
                  <span>£{monthlyGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {totalPreTax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', opacity: 0.6 }}>
                    <span>Pre-Tax Deductions</span>
                    <span style={{ color: 'var(--error)' }}>-£{totalPreTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {totalStatutory > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem', opacity: 0.6 }}>
                    <span>Statutory Deductions</span>
                    <span style={{ color: 'var(--error)' }}>-£{totalStatutory.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {totalPostTax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.75rem', opacity: 0.6 }}>
                    <span>Post-Tax Deductions</span>
                    <span style={{ color: 'var(--error)' }}>-£{totalPostTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="stat-label" style={{ margin: 0 }}>Estimated Net Pay:</span>
                  <strong style={{ fontSize: '1.5rem', color: 'var(--success)' }}>£{totalMonthlyNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>



            <div className="glass-card">
              <h2 style={{ margin: 0 }}>Annual Forecast</h2>
              <div className="stat-value" style={{ color: 'var(--success)', fontSize: '2.2rem' }}>£{projection.finalTakeHome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', opacity: 0.7 }}>
                <div><div className="stat-label">Taxable Income</div>£{projection.taxableIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div><div className="stat-label">Total Tax/NI</div>£{(projection.incomeTax + projection.ni).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                {projection.studentLoan > 0 && (
                  <div><div className="stat-label">Student Loan</div>£{projection.studentLoan.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                )}
                {projection.hicbc > 0 && (
                  <div><div className="stat-label">HICBC Charge</div>£{projection.hicbc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                )}
              </div>
              <hr style={{ opacity: 0.1, margin: '1.5rem 0' }} />

              <div style={{ marginTop: '1rem' }}>
                <div className="stat-label">Current Tax Code</div>
                <div style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span style={{ color: isCodeCorrect ? 'var(--text-main)' : 'var(--error)', fontWeight: 'bold' }}>{taxCode}</span>
                  {!isCodeCorrect && <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>→ Recommended: {recommendedCode}</span>}
                </div>
                {!isCodeCorrect && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--error)', margin: '0 0 0.5rem 0' }}>Your local tax code differs from HMRC recommendations for your projected Adjusted Net Income.</p>
                    <a
                      href="https://www.gov.uk/tax-codes/how-to-update-your-tax-code"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <ExternalLink size={12} /> How to update your tax code (GOV.UK)
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && <AnalyticsTab />}

        {activeTab === 'selfemployed' && (
          <SelfEmployedTab
            seData={seData}
            onUpdateSEData={setSEData}
            taxYear={taxYear}
            payeANI={analyticsData.projections.taxableIncome}
            payeIncomeTaxPaid={analyticsData.projections.incomeTax}
            taxCode={taxCode}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'guide' && <GuideTab taxYear={taxYear} workMode={workMode} />}

        {activeTab === 'overtime' && (
          <div>
            <div className="glass-card" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <button
                className="btn-primary btn-full btn-add btn-prominent"
                style={{ height: '3.5rem', fontSize: '1.1rem' }}
                onClick={() => {
                  setOtModalData({ id: null, date: new Date().toISOString().split('T')[0], hours: '', multiplier: 1.5, reason: '', monthIdx: selectedMonthIdx });
                  setShowOtModal(true);
                }}
              >
                <Plus size={24} /> Add Overtime Entry
              </button>
            </div>

            <div className="glass-card" style={{ marginBottom: '2rem' }}>
              <h2 style={{ margin: 0 }}>Overtime Summary</h2>
              <div className="dashboard-grid" style={{ marginTop: '1.5rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div className="stat-label">YTD Earned</div>
                  <div className="stat-value" style={{ color: 'var(--primary)' }}>£{ytdOTTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div className="stat-label">Unclaimed</div>
                  <div className="stat-value" style={{ color: 'var(--error)' }}>£{allOvertime.filter(o => !o.claimed).reduce((s, o) => s + calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', opacity: 0.7 }}>OT Summary</h3>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <select className="input-field" style={{ width: 'auto', padding: '0.3rem', fontSize: '0.8rem' }} value={otFilterMonth} onChange={(e) => setOtFilterMonth(e.target.value)}>
                    <option value="all">All Months</option>
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select className="input-field" style={{ width: 'auto', padding: '0.3rem', fontSize: '0.8rem' }} value={otFilterClaimed} onChange={(e) => setOtFilterClaimed(e.target.value)}>
                    <option value="all">All</option>
                    <option value="claimed">Claimed</option>
                    <option value="unclaimed">Unclaimed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overtime-list">
              {filteredOT.map(o => (
                <div key={o.id} className="overtime-line glass-card clickable" style={{ borderLeft: o.claimed ? '4px solid var(--success)' : '4px solid var(--error)', marginBottom: '1rem', padding: '1rem' }} onClick={() => { setOtModalData({ id: o.id, date: o.date || '', hours: o.hours, multiplier: o.multiplier, reason: o.reason || '', monthIdx: o.monthIdx, originalMonthIdx: o.monthIdx }); setShowOtModal(true); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <button className="btn-icon" onClick={(e) => { e.stopPropagation(); updateMonthItem(o.monthIdx, 'overtime', o.id, 'claimed', !o.claimed); }}>
                        {o.claimed ? <CheckSquare size={20} color="var(--success)" /> : <Square size={20} opacity={0.4} />}
                      </button>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{o.hours}h @ {o.multiplier}x</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                          {o.date} • {MONTHS[o.monthIdx]}
                          <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>#OT-{String(o.id).slice(-6)}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: 'var(--success)' }}>£{calculateOvertime(baseSalary, contractedHours, o.hours, o.multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <button className="btn-icon" style={{ color: 'var(--error)', marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); removeMonthItem(o.monthIdx, 'overtime', o.id); }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {o.reason && <div style={{ fontSize: '0.85rem', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '0.4rem', marginTop: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.05)' }}>{o.reason}</div>}
                </div>
              ))}
              {filteredOT.length === 0 && <p style={{ textAlign: 'center', opacity: 0.4, padding: '2rem 0' }}>No overtime logged.</p>}
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                <button onClick={exportUnclaimedOT} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                  <Download size={14} style={{ marginRight: '0.5rem' }} /> Export Unclaimed OT (.csv)
                </button>
                <button onClick={() => window.print()} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                  <Printer size={14} style={{ marginRight: '0.5rem' }} /> Print / PDF Report
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div>
            <div className="glass-card" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={20} /> Annual Configuration</h2>
                <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>
              </div>

              <div className="settings-box">
                <h3><Info size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} /> Basic Details</h3>
                <div className="dashboard-grid" style={{ marginTop: 0 }}>
                  <div><label className="stat-label">Tax Year</label>
                    <select value={taxYear} onChange={(e) => handleYearSwitch(e.target.value)} className="input-field">
                      {[...Array(17)].map((_, i) => {
                        const y1 = 2024 + i;
                        const y2 = String(y1 + 1).slice(-2);
                        const yrString = `${y1}/${y2}`;
                        return <option key={yrString} value={yrString}>{yrString}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="stat-label">Work Mode</label>
                    <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} className="input-field">
                      <option value="paye" style={{ background: '#1e293b' }}>PAYE Only</option>
                      <option value="se" style={{ background: '#1e293b' }}>Self-Employed Only</option>
                      <option value="both" style={{ background: '#1e293b' }}>PAYE + Self-Employed</option>
                    </select>
                  </div>
                  <div><label className="stat-label">Annual Salary (£)</label><input type="number" id="tour-salary" value={baseSalary} onChange={(e) => handleNumericInput(e.target.value, setBaseSalary)} className="input-field" /></div>
                  <div><label className="stat-label">Contracted Hours (wk)</label><input type="number" value={contractedHours} onChange={(e) => handleNumericInput(e.target.value, setContractedHours)} className="input-field" /></div>
                  <div><label className="stat-label">Tax Code</label><input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} className="input-field" /></div>
                </div>
              </div>

              <div className="settings-box">
                <h3><Landmark size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} /> Pension & Allowances</h3>
                <div className="dashboard-grid" style={{ marginTop: 0 }}>
                  <div><label className="stat-label">Base Pension %</label><input type="number" value={pensionPercent} onChange={(e) => handleNumericInput(e.target.value, setPensionPercent)} className="input-field" /></div>
                  <div>
                    <label className="stat-label">Pension Type (Mercer SS?)</label>
                    <select id="tour-pension-type" value={pensionType} onChange={(e) => setPensionType(e.target.value)} className="input-field">
                      <option value="standard" style={{ background: '#1e293b' }}>Standard (Relief at Source)</option>
                      <option value="salary_sacrifice" style={{ background: '#1e293b' }}>Salary Sacrifice (Mercer)</option>
                    </select>
                  </div>
                  <div><label className="stat-label">OT Holiday Supp. %</label><input type="number" step="0.1" value={holidaySupplementPercent} onChange={(e) => handleNumericInput(e.target.value, setHolidaySupplementPercent)} className="input-field" /></div>
                  <div><label className="stat-label">Children (Child Benefit)</label><input type="number" value={childBenefitCount} onChange={(e) => handleNumericInput(e.target.value, setChildBenefitCount)} className="input-field" /></div>
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <label className="stat-label">Student Loan Plans</label>
                  <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {['plan1', 'plan2', 'plan4', 'plan5', 'pgl'].map(plan => (
                      <label key={plan} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', border: studentLoanPlans.includes(plan) ? '1px solid var(--primary)' : '1px solid transparent' }}>
                        <input
                          type="checkbox"
                          checked={studentLoanPlans.includes(plan)}
                          onChange={(e) => {
                            if (e.target.checked) setStudentLoanPlans([...studentLoanPlans, plan]);
                            else setStudentLoanPlans(studentLoanPlans.filter(p => p !== plan));
                          }}
                          style={{ display: 'none' }}
                        />
                        <span style={{ color: studentLoanPlans.includes(plan) ? 'var(--primary)' : 'inherit' }}>{plan.toUpperCase()}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-box">
                <h3><Bot size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} /> AI Assistant Settings</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '1rem' }}>
                  To use the AI Tax Assistant and Payslip Scanner, you need to provide your own Google Gemini API Key.
                </p>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', borderLeft: '3px solid var(--primary)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>How to get a free key:</div>
                  <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', lineHeight: '1.4' }}>
                    <li>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Google AI Studio</a></li>
                    <li>Sign in and click <strong>"Create API Key"</strong></li>
                    <li>Copy the key and paste it below</li>
                  </ol>
                </div>
                <div>
                  <label className="stat-label">Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="input-field"
                    placeholder="Paste your API key here (AIza...)"
                  />
                  <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '0.5rem' }}>Your key is stored securely in your private profile and is never shared.</p>
                </div>
              </div>

              <div className="settings-box">
                <h3><Calculator size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} /> Recurring Salary Modifiers</h3>
                <div className="dashboard-grid" style={{ marginTop: 0 }}>
                  <div>
                    <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                      Recurring Enhancements
                      <button className="btn-add" onClick={() => {
                        setBaseModifierModalData({ id: null, type: 'enhancement', name: '', amount: '', frequency: 'annual', sacrificeType: 'salary_sacrifice' });
                        setShowBaseModifierModal(true);
                      }} title="Add Enhancement">
                        <Plus size={16} />
                      </button>
                    </div>
                    {baseEnhancements.map(e => (
                      <div key={e.id} className="overtime-line glass-card clickable" style={{ borderLeft: '4px solid var(--success)', marginBottom: '0.75rem', padding: '0.75rem', cursor: 'pointer' }} onClick={() => {
                        setBaseModifierModalData({ id: e.id, type: 'enhancement', name: e.name, amount: e.amount, frequency: e.frequency || 'monthly', sacrificeType: e.type || 'income' });
                        setShowBaseModifierModal(true);
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{e.name}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{e.frequency.charAt(0).toUpperCase() + e.frequency.slice(1)}</div>
                          </div>
                          <div style={{ fontWeight: 600, color: 'var(--success)' }}>+£{Number(e.amount).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                    {baseEnhancements.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center', marginTop: '1rem' }}>No enhancements.</p>}
                  </div>
                  <div>
                    <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                      Recurring Sacrifices
                      <button className="btn-add" onClick={() => {
                        setBaseModifierModalData({ id: null, type: 'sacrifice', name: '', amount: '', frequency: 'annual', sacrificeType: 'salary_sacrifice' });
                        setShowBaseModifierModal(true);
                      }} title="Add Sacrifice">
                        <Plus size={16} />
                      </button>
                    </div>
                    {baseSacrifices.map(d => (
                      <div key={d.id} className="overtime-line glass-card clickable" style={{ borderLeft: '4px solid var(--error)', marginBottom: '0.75rem', padding: '0.75rem', cursor: 'pointer' }} onClick={() => {
                        setBaseModifierModalData({ id: d.id, type: 'sacrifice', name: d.name, amount: d.amount, frequency: d.frequency || 'monthly', sacrificeType: d.type || 'salary_sacrifice' });
                        setShowBaseModifierModal(true);
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{d.name}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{d.frequency.charAt(0).toUpperCase() + d.frequency.slice(1)} • {d.type === 'salary_sacrifice' ? 'Gross' : 'Net'}</div>
                          </div>
                          <div style={{ fontWeight: 600, color: 'var(--error)' }}>-£{Number(d.amount).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                    {baseSacrifices.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center', marginTop: '1rem' }}>No sacrifices.</p>}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '0.8rem', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Copy size={18} /> Data Management
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="stat-label">Copy Settings From:</label>
                    <select value={sourceYearForCopy} onChange={(e) => setSourceYearForCopy(e.target.value)} className="input-field">
                      {[...Array(17)].map((_, i) => {
                        const y1 = 2024 + i;
                        const y2 = String(y1 + 1).slice(-2);
                        const yrString = `${y1}/${y2}`;
                        return <option key={yrString} value={yrString}>{yrString}</option>;
                      })}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="stat-label">Copy Settings To:</label>
                    <select value={targetYearForCopy} onChange={(e) => setTargetYearForCopy(e.target.value)} className="input-field">
                      {[...Array(17)].map((_, i) => {
                        const y1 = 2024 + i;
                        const y2 = String(y1 + 1).slice(-2);
                        const yrString = `${y1}/${y2}`;
                        return <option key={yrString} value={yrString}>{yrString}</option>;
                      })}
                    </select>
                  </div>
                  <button
                    onClick={() => handleCopyTaxYearData(sourceYearForCopy, targetYearForCopy)}
                    className="btn-secondary"
                    style={{ gridColumn: '1 / -1', padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
                    disabled={sourceYearForCopy === targetYearForCopy}
                  >
                    Duplicate Settings To {targetYearForCopy}
                  </button>
                </div>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', opacity: 0.5 }}>
                  This will duplicate all salary settings, pensions, recurring items, and monthly logs from the source year into the selected target year profile.
                </p>
              </div>

              <div className="card" style={{ marginTop: '1.5rem', opacity: 0.5 }}>
                <div style={{ fontSize: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <p>© 2026 taxtracker.uk - Accurate logic based on HMRC 25/26 guidelines.</p>
                </div>
              </div>

              <div style={{ marginTop: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                <button onClick={exportToCSV} className="btn-primary" style={{ padding: '0.75rem 2rem' }}>
                  <Download size={18} style={{ marginRight: '0.5rem' }} /> Export Year to CSV
                </button>
                <button onClick={() => window.print()} className="btn-secondary">
                  <LayoutDashboard size={14} style={{ marginRight: '0.5rem' }} /> Print PDF Report
                </button>
                <button onClick={clearCacheAndReload} className="btn-secondary" style={{ opacity: 0.5 }}>
                  <RefreshCw size={14} style={{ marginRight: '0.5rem' }} /> Force Update
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Footer */}
        <footer style={{
          marginTop: '3rem',
          paddingTop: '2rem',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          paddingBottom: '3rem'
        }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={14} color="var(--success)" /> UK Tax Year {taxYear} - Professional Grade
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{currentUser?.email}</span>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            <button
              onClick={() => signOut(auth)}
              title="Sign Out"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fca5a5',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem',
                padding: 0
              }}
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </footer>
      </main>

      <nav className="nav-bar" style={{ gridTemplateColumns: workMode !== 'paye' ? 'repeat(6, 1fr)' : 'repeat(4, 1fr)' }}>
        <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={20} />
          <span>Home</span>
        </div>
        <div className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} id="tour-analytics-trigger" onClick={() => setActiveTab('analytics')}>
          <BarChart3 size={20} />
          <span>Stats</span>
        </div>
        <div className={`nav-item ${activeTab === 'overtime' ? 'active' : ''}`} onClick={() => setActiveTab('overtime')}>
          <Clock size={20} />
          <span>OT</span>
        </div>
        {workMode !== 'paye' && (
          <div className={`nav-item ${activeTab === 'selfemployed' ? 'active' : ''}`} onClick={() => setActiveTab('selfemployed')}>
            <Briefcase size={20} />
            <span>SE</span>
          </div>
        )}
        {workMode !== 'paye' && (
          <div className={`nav-item ${activeTab === 'guide' ? 'active' : ''}`} onClick={() => setActiveTab('guide')}>
            <BookOpen size={20} />
            <span>Guide</span>
          </div>
        )}
        <div className={`nav-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          <Settings size={20} />
          <span>Settings</span>
        </div>
      </nav>

      {showBaseModifierModal && (
        <div className="modal-overlay" onClick={() => setShowBaseModifierModal(false)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>{baseModifierModalData.id ? `Edit ${baseModifierModalData.type === 'enhancement' ? 'Enhancement' : 'Sacrifice'}` : `Add ${baseModifierModalData.type === 'enhancement' ? 'Enhancement' : 'Sacrifice'}`}</h2>
              <button className="btn-icon" onClick={() => setShowBaseModifierModal(false)}><Trash2 size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 0 }}>
              <div>
                <label className="stat-label">Description / Name</label>
                <input className="input-field" value={baseModifierModalData.name} onChange={e => setBaseModifierModalData({ ...baseModifierModalData, name: e.target.value })} placeholder="e.g. Car Allowance" />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="stat-label">Amount (£)</label>
                  <input type="number" className="input-field" value={baseModifierModalData.amount} onChange={e => handleNumericInput(e.target.value, (v) => setBaseModifierModalData({ ...baseModifierModalData, amount: v }))} placeholder="0" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="stat-label">Frequency</label>
                  <select className="input-field" value={baseModifierModalData.frequency} onChange={e => setBaseModifierModalData({ ...baseModifierModalData, frequency: e.target.value })}>
                    <option value="annual" style={{ background: '#1e293b' }}>Annual</option>
                    <option value="monthly" style={{ background: '#1e293b' }}>Monthly</option>
                    <option value="hourly" style={{ background: '#1e293b' }}>Hourly</option>
                  </select>
                </div>
              </div>
              {baseModifierModalData.type === 'sacrifice' && (
                <div>
                  <label className="stat-label">Sacrifice Type</label>
                  <select className="input-field" value={baseModifierModalData.sacrificeType} onChange={e => setBaseModifierModalData({ ...baseModifierModalData, sacrificeType: e.target.value })}>
                    <option value="salary_sacrifice" style={{ background: '#1e293b' }}>Gross / Pre-Tax</option>
                    <option value="net_sacrifice" style={{ background: '#1e293b' }}>Net / Post-Tax</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              {baseModifierModalData.id && (
                <button
                  className="btn-secondary"
                  style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                  onClick={() => {
                    removeBaseItem(baseModifierModalData.type, baseModifierModalData.id);
                    setShowBaseModifierModal(false);
                  }}
                >
                  Delete
                </button>
              )}
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const idToUse = baseModifierModalData.id || Date.now().toString();
                  const newItem = {
                    id: idToUse,
                    name: baseModifierModalData.name || 'Unnamed',
                    amount: Number(baseModifierModalData.amount) || 0,
                    frequency: baseModifierModalData.frequency,
                    type: baseModifierModalData.type === 'sacrifice' ? baseModifierModalData.sacrificeType : 'income'
                  };

                  if (baseModifierModalData.type === 'enhancement') {
                    if (baseModifierModalData.id) {
                      setBaseEnhancements(baseEnhancements.map(i => i.id === idToUse ? newItem : i));
                    } else {
                      setBaseEnhancements([...baseEnhancements, newItem]);
                    }
                  } else {
                    if (baseModifierModalData.id) {
                      setBaseSacrifices(baseSacrifices.map(i => i.id === idToUse ? newItem : i));
                    } else {
                      setBaseSacrifices([...baseSacrifices, newItem]);
                    }
                  }
                  setShowBaseModifierModal(false);
                }}
              >
                {baseModifierModalData.id ? 'Save Changes' : 'Add Modifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOtModal && (
        <div className="modal-overlay" onClick={() => setShowOtModal(false)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>{otModalData.id ? 'Edit Overtime Entry' : 'Add Overtime'}</h2>
              <button className="btn-icon" onClick={() => setShowOtModal(false)}><Trash2 size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button className="preset-button" onClick={() => setOtModalData({ ...otModalData, hours: 4, multiplier: 1.5 })}>4h @ 1.5x</button>
              <button className="preset-button" onClick={() => setOtModalData({ ...otModalData, hours: 12, multiplier: 2.0 })}>12h @ 2.0x</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 0 }}>
              <div>
                <label className="stat-label">Month Paid</label>
                <select className="input-field" value={otModalData.monthIdx} onChange={e => setOtModalData({ ...otModalData, monthIdx: Number(e.target.value) })}>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="stat-label">Date Worked</label>
                <input type="date" className="input-field" value={otModalData.date} onChange={e => setOtModalData({ ...otModalData, date: e.target.value })} />
              </div>
              <div>
                <label className="stat-label">Hours</label>
                <input type="number" className="input-field" value={otModalData.hours} onChange={e => handleNumericInput(e.target.value, (v) => setOtModalData({ ...otModalData, hours: v }))} placeholder="0" />
              </div>
              <div>
                <label className="stat-label">Multiplier</label>
                <select className="input-field" value={otModalData.multiplier} onChange={e => setOtModalData({ ...otModalData, multiplier: Number(e.target.value) })}>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                  <option value={1.0}>1.0x</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="stat-label">Reason / Reference</label>
                <input className="input-field" value={otModalData.reason} onChange={e => setOtModalData({ ...otModalData, reason: e.target.value })} placeholder="e.g. Weekend Coverage" />
              </div>
            </div>

            <button
              className="btn-primary btn-full"
              style={{ marginTop: '2rem' }}
              onClick={() => {
                const newMonths = [...months];
                if (otModalData.id) {
                  // Edit mode
                  const origIdx = otModalData.originalMonthIdx !== undefined ? otModalData.originalMonthIdx : otModalData.monthIdx;
                  const currentMonthItems = newMonths[origIdx].overtime;
                  const itemIndex = currentMonthItems.findIndex(i => i.id === otModalData.id);
                  if (itemIndex > -1) {
                    const updatedItem = { ...currentMonthItems[itemIndex], date: otModalData.date, reason: otModalData.reason, hours: Number(otModalData.hours) || 0, multiplier: otModalData.multiplier, monthIdx: otModalData.monthIdx };
                    if (origIdx !== otModalData.monthIdx) {
                      newMonths[origIdx].overtime = currentMonthItems.filter(i => i.id !== otModalData.id);
                      newMonths[otModalData.monthIdx].overtime = [updatedItem, ...newMonths[otModalData.monthIdx].overtime];
                    } else {
                      currentMonthItems[itemIndex] = updatedItem;
                    }
                  }
                } else {
                  // Add mode
                  const newItem = {
                    id: Date.now(),
                    date: otModalData.date,
                    reason: otModalData.reason,
                    hours: Number(otModalData.hours) || 0,
                    multiplier: otModalData.multiplier,
                    claimed: false,
                    monthIdx: otModalData.monthIdx
                  };
                  newMonths[otModalData.monthIdx].overtime = [newItem, ...newMonths[otModalData.monthIdx].overtime];
                }
                setMonths(newMonths);
                setShowOtModal(false);
                setOtModalData({ id: null, date: new Date().toISOString().split('T')[0], hours: '', multiplier: 1.5, reason: '', monthIdx: selectedMonthIdx });
              }}
            >
              {otModalData.id ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </div>
      )}

      {tourStep !== null && <TourOverlay />}

      {/* AI Tax Assistant - floating chat button */}
      <AiAssistant
        analyticsData={analyticsData}
        workMode={workMode}
        taxCode={taxCode}
        taxYear={taxYear}
        geminiApiKey={geminiApiKey}
        onGoToSettings={() => setActiveTab('config')}
        months={months}
        selectedMonthIdx={selectedMonthIdx}
        onUpdateMonth={(monthIdx, newMonthData) => {
          setMonths(prev => {
            const updated = [...prev];
            updated[monthIdx] = newMonthData;
            return updated;
          });
        }}
      />
    </div>
  );
}

export default App;
