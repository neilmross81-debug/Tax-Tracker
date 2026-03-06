/**
 * UK Self Assessment Tax Calculator - v21.1
 * Class 2 NI, Class 4 NI, Payments on Account, Mileage, VAT, Capital Allowances, Student Loans
 * Based on 2025/26 HMRC rules.
 */

const round = (val) => Math.round(val * 100) / 100;

const SE_CONSTANTS = {
    '2025/26': {
        class2WeeklyRate: 3.45,
        class2SmallProfitsThreshold: 6725,   // Below this: no class 2, but NI credit given
        class2LowerProfitsThreshold: 12570,  // Above this: class 2 payable
        class4MainRate: 0.06,                // 6% - reduced from 8% in Apr 2024 then 6% Apr 2025
        class4UpperRate: 0.02,
        class4LowerLimit: 12570,
        class4UpperLimit: 50270,
        mileageRate1: 0.45,                  // First 10,000 miles
        mileageRate2: 0.25,                  // Over 10,000 miles
        mileageCutoff: 10000,
        tradingAllowance: 1000,
        vatThreshold: 90000,
        paymentsOnAccountThreshold: 1000,    // SA bill > this to trigger PoA
        slPlan1Threshold: 24910,
        slPlan2Threshold: 27295,
        slPlan4Threshold: 31395,
        slPlan5Threshold: 25000,
        slPglThreshold: 21000,
        slRate: 0.09,
        slPglRate: 0.06
    },
    '2024/25': {
        class2WeeklyRate: 3.45,
        class2SmallProfitsThreshold: 6725,
        class2LowerProfitsThreshold: 12570,
        class4MainRate: 0.08,
        class4UpperRate: 0.02,
        class4LowerLimit: 12570,
        class4UpperLimit: 50270,
        mileageRate1: 0.45,
        mileageRate2: 0.25,
        mileageCutoff: 10000,
        tradingAllowance: 1000,
        vatThreshold: 90000,
        paymentsOnAccountThreshold: 1000,
        slPlan1Threshold: 24910,
        slPlan2Threshold: 27295,
        slPlan4Threshold: 31395,
        slPlan5Threshold: 25000,
        slPglThreshold: 21000,
        slRate: 0.09,
        slPglRate: 0.06
    }
};

/**
 * Calculate Class 2 NI for self-employed
 */
export const calculateClass2NI = (annualProfit, taxYear = '2025/26') => {
    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];
    if (annualProfit < cfg.class2SmallProfitsThreshold) {
        return { amount: 0, note: 'Below Small Profits Threshold — NI credit still applies.' };
    }
    if (annualProfit < cfg.class2LowerProfitsThreshold) {
        return { amount: 0, note: 'Between SPT and LPT — no Class 2 to pay, NI credit given.' };
    }
    const annual = round(cfg.class2WeeklyRate * 52);
    return { amount: annual, note: `£${cfg.class2WeeklyRate}/week × 52 weeks` };
};

/**
 * Calculate Class 4 NI for self-employed
 */
export const calculateClass4NI = (annualProfit, taxYear = '2025/26') => {
    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];
    let ni = 0;
    const mainBand = Math.max(0, Math.min(annualProfit, cfg.class4UpperLimit) - cfg.class4LowerLimit);
    ni += mainBand * cfg.class4MainRate;
    if (annualProfit > cfg.class4UpperLimit) {
        ni += (annualProfit - cfg.class4UpperLimit) * cfg.class4UpperRate;
    }
    return round(ni);
};

/**
 * Calculate Capital Allowances
 */
export const calculateCapitalAllowances = (assets) => {
    let totalAIA = 0;
    let mainPoolWDA = 0;
    let specialPoolWDA = 0;

    assets.forEach(asset => {
        const cost = Number(asset.cost || 0);
        // AIA limit is £1m, so we just assume AIA for simplicity unless cars
        if (asset.type === 'equipment' || asset.type === 'van' || asset.type === 'ev') {
            totalAIA += cost;
        } else if (asset.type === 'car_low') { // Car <= 50g/km (main pool 18%)
            mainPoolWDA += cost * 0.18;
        } else if (asset.type === 'car_high') { // Car > 50g/km (special pool 6%)
            specialPoolWDA += cost * 0.06;
        }
    });

    return round(totalAIA + mainPoolWDA + specialPoolWDA);
};

/**
 * Calculate mileage allowance
 */
export const calculateMileageAllowance = (totalMiles, taxYear = '2025/26') => {
    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];
    const rate1Miles = Math.min(totalMiles, cfg.mileageCutoff);
    const rate2Miles = Math.max(0, totalMiles - cfg.mileageCutoff);
    const allowance = round(rate1Miles * cfg.mileageRate1 + rate2Miles * cfg.mileageRate2);
    return {
        totalMiles,
        rate1Miles,
        rate2Miles,
        rate1Value: round(rate1Miles * cfg.mileageRate1),
        rate2Value: round(rate2Miles * cfg.mileageRate2),
        totalAllowance: allowance,
        remainingAt45p: Math.max(0, cfg.mileageCutoff - totalMiles),
        rateDropped: totalMiles > cfg.mileageCutoff,
    };
};

/**
 * Calculate taxable SE profit
 */
export const calculateSEProfit = (params) => {
    const { grossIncome, totalExpenses, mileageAllowance, useTradingAllowance, capitalAllowances = 0, taxYear = '2025/26' } = params;
    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];

    if (useTradingAllowance) {
        const deduction = Math.min(grossIncome, cfg.tradingAllowance);
        const profit = Math.max(0, grossIncome - deduction);
        return { grossIncome, deduction, profit, method: 'trading_allowance' };
    }

    const totalDeductions = totalExpenses + mileageAllowance + capitalAllowances;
    const profit = Math.max(0, grossIncome - totalDeductions);
    return { grossIncome, deduction: totalDeductions, profit, method: 'actual_expenses' };
};

/**
 * Calculate SE Income Tax with SIPP/Gift Aid band extension
 */
export const calculateSEIncomeTax = (params) => {
    const { payeANI, seProfit, taxCode, sipp = 0, giftAid = 0, taxYear = '2025/26' } = params;
    if (seProfit <= 0) return 0;

    const BANDS = {
        '2025/26': { paMax: 12570, basicRateLimit: 37700, paThreshold: 100000 },
        '2024/25': { paMax: 12570, basicRateLimit: 37700, paThreshold: 100000 },
    };
    const cfg = BANDS[taxYear] || BANDS['2025/26'];
    const higherRateLimit = 125140;

    // SIPP and Gift Aid (Grossed up: devide by 0.8)
    const grossedUpSipp = sipp / 0.8;
    const grossedUpGiftAid = giftAid / 0.8;
    const totalExtension = grossedUpSipp + grossedUpGiftAid;

    // Tapered PA uses ANI (before extension)
    const combinedANI = payeANI + seProfit - totalExtension;

    let pa = cfg.paMax;
    if (combinedANI > cfg.paThreshold) {
        pa = Math.max(0, pa - (combinedANI - cfg.paThreshold) / 2);
    }

    const calcTax = (income) => {
        let taxable = Math.max(0, income - pa);
        let tax = 0;
        // Basic rate band is extended by SIPP/Gift Aid
        const extendedBasicRateLimit = cfg.basicRateLimit + totalExtension;

        const basic = Math.min(taxable, extendedBasicRateLimit);
        tax += basic * 0.20;
        taxable -= basic;

        const higher = Math.min(taxable, higherRateLimit + totalExtension - cfg.paMax - extendedBasicRateLimit);
        tax += higher * 0.40;
        taxable -= higher;

        if (taxable > 0) tax += taxable * 0.45;
        return tax;
    };

    const taxOnCombined = calcTax(payeANI + seProfit);
    const taxOnPAYEOnly = calcTax(payeANI);

    return round(Math.max(0, taxOnCombined - taxOnPAYEOnly));
};

/**
 * Calculate Student Loan repayments for SA
 */
export const calculateStudentLoanSA = (totalIncomeForSL, studentLoanPlans, taxYear = '2025/26') => {
    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];
    let totalRepayment = 0;

    const plans = studentLoanPlans || [];

    // Most common plans (Highest threshold takes priority if overlap, but HMRC calculates per plan)
    // Simple version: find the lowest threshold for plans 1-5 and calculate at 9%
    const mainPlanThresholds = plans.filter(p => p !== 'pgl').map(p => {
        if (p === 'plan1') return cfg.slPlan1Threshold;
        if (p === 'plan2') return cfg.slPlan2Threshold;
        if (p === 'plan4') return cfg.slPlan4Threshold;
        if (p === 'plan5') return cfg.slPlan5Threshold;
        return Infinity;
    });

    if (mainPlanThresholds.length > 0) {
        const minThreshold = Math.min(...mainPlanThresholds);
        if (totalIncomeForSL > minThreshold) {
            totalRepayment += (totalIncomeForSL - minThreshold) * cfg.slRate;
        }
    }

    if (plans.includes('pgl') && totalIncomeForSL > cfg.slPglThreshold) {
        totalRepayment += (totalIncomeForSL - cfg.slPglThreshold) * cfg.slPglRate;
    }

    return round(totalRepayment);
};

/**
 * Full Self Assessment bill calculation.
 */
export const calculateSelfAssessment = (params) => {
    const { payeANI = 0, payeIncomeTaxPaid = 0, seProfit = 0, taxCode = '1257L', sipp = 0, giftAid = 0, studentLoanPlans = [], taxYear = '2025/26', payeStudentLoanPaid = 0 } = params;
    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];

    const class2 = calculateClass2NI(seProfit, taxYear);
    const class4 = calculateClass4NI(seProfit, taxYear);
    const seIncomeTax = calculateSEIncomeTax({ payeANI, seProfit, taxCode, sipp, giftAid, taxYear });

    // Student Loan through SA
    const totalIncomeForSL = payeANI + seProfit;
    const totalSLDue = calculateStudentLoanSA(totalIncomeForSL, studentLoanPlans, taxYear);
    const slDueViaSA = Math.max(0, totalSLDue - payeStudentLoanPaid);

    const totalSABill = round(seIncomeTax + class2.amount + class4 + slDueViaSA);

    const totalTaxLiability = totalSABill + payeIncomeTaxPaid;
    const fractionAtSource = totalTaxLiability > 0 ? payeIncomeTaxPaid / totalTaxLiability : 1;
    const poaRequired = totalSABill > cfg.paymentsOnAccountThreshold && fractionAtSource < 0.8;
    const poaAmount = poaRequired ? round(totalSABill / 2) : 0;

    const taxYearStart = parseInt(taxYear.split('/')[0]);
    return {
        seIncomeTax, class2NI: class2.amount, class2Note: class2.note, class4NI: class4, slDueViaSA, totalSABill, poaRequired, poaAmount,
        poa1Date: `31 January ${taxYearStart + 2}`,
        poa2Date: `31 July ${taxYearStart + 2}`,
        filingDeadline: `31 January ${taxYearStart + 2}`,
        januaryPayment: round(totalSABill + poaAmount),
        julyPayment: poaAmount,
    };
};

/**
 * VAT summary
 */
export const calculateVAT = (invoices, expenses, vatRate = 0.20) => {
    const outputVAT = round(invoices * vatRate);
    const inputVAT = round(expenses * vatRate);
    return { outputVAT, inputVAT, netVATOwed: round(outputVAT - inputVAT) };
};

export default {
    calculateClass2NI, calculateClass4NI, calculateCapitalAllowances, calculateMileageAllowance, calculateSEProfit, calculateSEIncomeTax, calculateStudentLoanSA, calculateSelfAssessment, calculateVAT,
};
