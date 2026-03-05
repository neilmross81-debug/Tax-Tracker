/**
 * UK Self Assessment Tax Calculator - v21.0
 * Class 2 NI, Class 4 NI, Payments on Account, Mileage, VAT
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
    }
};

/**
 * Calculate Class 2 NI for self-employed
 * Returns annual amount payable
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
 * Calculate mileage allowance for the year.
 * Returns total allowance value and per-mile breakdown.
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
 * Calculate taxable SE profit given income and expenses.
 * Trading allowance and itemised expenses are mutually exclusive.
 */
export const calculateSEProfit = (grossIncome, totalExpenses, mileageAllowance, useTradingAllowance, taxYear = '2025/26') => {
    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];
    if (useTradingAllowance) {
        const deduction = Math.min(grossIncome, cfg.tradingAllowance);
        const profit = Math.max(0, grossIncome - deduction);
        return { grossIncome, deduction, profit, method: 'trading_allowance' };
    }
    const totalDeductions = totalExpenses + mileageAllowance;
    const profit = Math.max(0, grossIncome - totalDeductions);
    return { grossIncome, deduction: totalDeductions, profit, method: 'actual_expenses' };
};

/**
 * Calculate the income tax attributable to SE profit when stacked on top of PAYE income.
 * payeANI = PAYE Adjusted Net Income (after PAYE sacifices/pension)
 * seProfit = self-employment taxable profit
 */
export const calculateSEIncomeTax = (payeANI, seProfit, taxCode, taxYear = '2025/26') => {
    if (seProfit <= 0) return 0;

    // Import band config from the same constants used in TaxCalculator
    const BANDS = {
        '2025/26': { paMax: 12570, basicRateLimit: 37700, paThreshold: 100000 },
        '2024/25': { paMax: 12570, basicRateLimit: 37700, paThreshold: 100000 },
    };
    const cfg = BANDS[taxYear] || BANDS['2025/26'];
    const higherRateLimit = 125140;

    // Combined ANI
    const combinedANI = payeANI + seProfit;

    // Personal allowance (may be tapered)
    let pa = cfg.paMax;
    if (combinedANI > cfg.paThreshold) {
        pa = Math.max(0, pa - (combinedANI - cfg.paThreshold) / 2);
    }

    // Tax on total combined income
    const calcTax = (income) => {
        let taxable = Math.max(0, income - pa);
        let tax = 0;
        const basic = Math.min(taxable, cfg.basicRateLimit);
        tax += basic * 0.20;
        taxable -= basic;
        const higher = Math.min(taxable, higherRateLimit - cfg.paMax - cfg.basicRateLimit);
        tax += higher * 0.40;
        taxable -= higher;
        if (taxable > 0) tax += taxable * 0.45;
        return tax;
    };

    const taxOnCombined = calcTax(combinedANI);
    const taxOnPAYEOnly = calcTax(payeANI);

    return round(Math.max(0, taxOnCombined - taxOnPAYEOnly));
};

/**
 * Full Self Assessment bill calculation.
 * Returns everything needed to build the SA summary and PoA planner.
 */
export const calculateSelfAssessment = (params) => {
    const {
        payeANI = 0,
        payeIncomeTaxPaid = 0,   // tax already deducted at source (used for PoA check)
        seProfit = 0,
        taxCode = '1257L',
        taxYear = '2025/26',
    } = params;

    const cfg = SE_CONSTANTS[taxYear] || SE_CONSTANTS['2025/26'];

    const class2 = calculateClass2NI(seProfit, taxYear);
    const class4 = calculateClass4NI(seProfit, taxYear);
    const seIncomeTax = calculateSEIncomeTax(payeANI, seProfit, taxCode, taxYear);

    const totalSABill = round(seIncomeTax + class2.amount + class4);

    // Payments on Account logic
    // Required if bill > £1,000 and < 80% was collected at source
    const totalTaxLiability = totalSABill + payeIncomeTaxPaid;
    const fractionAtSource = totalTaxLiability > 0 ? payeIncomeTaxPaid / totalTaxLiability : 1;
    const poaRequired = totalSABill > cfg.paymentsOnAccountThreshold && fractionAtSource < 0.8;

    const poaAmount = poaRequired ? round(totalSABill / 2) : 0;

    // Filing year (Jan after tax year end)
    const taxYearStart = parseInt(taxYear.split('/')[0]);
    const filingDeadline = `31 January ${taxYearStart + 2}`;
    const poa1Date = `31 January ${taxYearStart + 2}`;  // same as filing deadline in year 1
    const poa2Date = `31 July ${taxYearStart + 2}`;

    return {
        seIncomeTax,
        class2NI: class2.amount,
        class2Note: class2.note,
        class4NI: class4,
        totalSABill,
        poaRequired,
        poaAmount,
        poa1Date,
        poa2Date,
        filingDeadline,
        // In year 1: Jan payment = balancing + 1st PoA
        januaryPayment: round(totalSABill + poaAmount),
        julyPayment: poaAmount,
    };
};

/**
 * VAT summary for a year's invoices and expenses
 */
export const calculateVAT = (invoices, expenses, vatRate = 0.20) => {
    const outputVAT = round(invoices * vatRate);
    const inputVAT = round(expenses * vatRate);
    return {
        outputVAT,
        inputVAT,
        netVATOwed: round(outputVAT - inputVAT),
    };
};

export const SE_TAX_YEAR_CONSTANTS = SE_CONSTANTS;

export default {
    calculateClass2NI,
    calculateClass4NI,
    calculateMileageAllowance,
    calculateSEProfit,
    calculateSEIncomeTax,
    calculateSelfAssessment,
    calculateVAT,
};
