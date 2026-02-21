/**
 * UK Tax Calculator 2025/26 - Advanced Features
 * Handles Tax Codes, Overtime Calculations, and Tax-Free Expenses.
 */

/**
 * Parses a UK tax code to return the personal allowance.
 */
const parseTaxCode = (code) => {
    const cleanCode = code.toUpperCase().trim();

    if (cleanCode === 'BR') return 0; // Basic Rate
    if (cleanCode === 'D0') return -999999; // Higher Rate
    if (cleanCode === 'D1') return -9999999; // Additional Rate
    if (cleanCode === 'NT') return 1000000; // No Tax

    const match = cleanCode.match(/(\d+)/);
    if (match) {
        const value = parseInt(match[1]) * 10;
        if (cleanCode.startsWith('K')) return -value; // K code (negative allowance)
        return value;
    }
    return 12570; // Default
};

/**
 * Main Tax Calculation Engine
 */
export const calculateTax = (annualGross, pensionContribution = 0, salarySacrifice = 0, taxCode = '1257L') => {
    // Taxable income is gross minus salary sacrifice and pension
    const taxableIncome = Math.max(0, annualGross - pensionContribution - salarySacrifice);

    let baseAllowance = parseTaxCode(taxCode);
    let personalAllowance = baseAllowance;

    // Personal Allowance Taper (> £100k)
    if (taxableIncome > 100000 && personalAllowance > 0) {
        const reduction = Math.min(personalAllowance, (taxableIncome - 100000) / 2);
        personalAllowance -= reduction;
    }

    // Adjusted Taxable (K codes increase taxable income)
    let workingTaxable = taxableIncome;
    if (baseAllowance < 0) {
        workingTaxable += Math.abs(baseAllowance);
        personalAllowance = 0;
    }

    // Income Tax Bands
    let incomeTax = 0;
    let remainingTaxable = workingTaxable - personalAllowance;

    if (remainingTaxable > 0) {
        // Basic Rate
        const basicRateBand = Math.min(remainingTaxable, 50270 - 12570);
        incomeTax += basicRateBand * 0.20;
        remainingTaxable -= basicRateBand;

        if (remainingTaxable > 0) {
            // Higher Rate
            const higherRateBand = Math.min(remainingTaxable, 125140 - 50270);
            incomeTax += higherRateBand * 0.40;
            remainingTaxable -= higherRateBand;

            if (remainingTaxable > 0) {
                // Additional Rate
                incomeTax += remainingTaxable * 0.45;
            }
        }
    }

    // National Insurance
    let ni = 0;
    if (annualGross > 12570) {
        const mainBand = Math.min(annualGross, 50270) - 12570;
        ni += mainBand * 0.08;

        if (annualGross > 50270) {
            const upperBand = annualGross - 50270;
            ni += upperBand * 0.02;
        }
    }

    return {
        gross: annualGross,
        taxableIncome,
        personalAllowance,
        incomeTax,
        ni,
        pensionContribution,
        salarySacrifice,
        takeHome: taxableIncome - incomeTax - ni,
        monthlyTakeHome: (taxableIncome - incomeTax - ni) / 12
    };
};

/**
 * Calculates hourly rate and overtime value
 */
export const calculateOvertime = (annualSalary, contractedHours, otHours, multiplier) => {
    if (!contractedHours || contractedHours <= 0) return 0;
    const hourlyRate = (annualSalary / 52) / contractedHours;
    return hourlyRate * otHours * multiplier;
};

/**
 * Projects year-end totals including OT and Expenses
 */
export const projectAnnual = (monthsData, currentMonthIndex, taxCode, baseSalary) => {
    let ytdGross = 0;
    let ytdPension = 0;
    let ytdSacrifice = 0;
    let ytdTaxFree = 0;

    // Sum up everything to current month
    for (let i = 0; i <= currentMonthIndex; i++) {
        const m = monthsData[i];
        ytdGross += m.income.reduce((s, item) => s + Number(item.amount), 0);
        ytdPension += m.deductions.reduce((s, item) => s + (item.type === 'pension' ? Number(item.amount) : 0), 0);
        ytdSacrifice += m.deductions.reduce((s, item) => s + (item.type === 'salary_sacrifice' ? Number(item.amount) : 0), 0);
        ytdTaxFree += m.deductions.reduce((s, item) => s + (item.type === 'tax_free' ? Number(item.amount) : 0), 0);
    }

    // Project remaining months based on current month's trend
    const remaining = 11 - currentMonthIndex;
    const curr = monthsData[currentMonthIndex];
    const monthlyGross = curr.income.reduce((s, item) => s + Number(item.amount), 0);
    const monthlyPension = curr.deductions.reduce((s, item) => s + (item.type === 'pension' ? Number(item.amount) : 0), 0);
    const monthlySacrifice = curr.deductions.reduce((s, item) => s + (item.type === 'salary_sacrifice' ? Number(item.amount) : 0), 0);
    const monthlyTaxFree = curr.deductions.reduce((s, item) => s + (item.type === 'tax_free' ? Number(item.amount) : 0), 0);

    const projectedGross = ytdGross + (monthlyGross * remaining);
    const projectedPension = ytdPension + (monthlyPension * remaining);
    const projectedSacrifice = ytdSacrifice + (monthlySacrifice * remaining);
    const projectedTaxFree = ytdTaxFree + (monthlyTaxFree * remaining);

    const taxResults = calculateTax(projectedGross, projectedPension, projectedSacrifice, taxCode);

    return {
        ...taxResults,
        projectedTaxFree,
        finalTakeHome: taxResults.takeHome + projectedTaxFree
    };
};

export const getTaxTrapAdvice = (projectedTaxableIncome) => {
    if (projectedTaxableIncome > 100000 && projectedTaxableIncome < 125140) {
        const excess = projectedTaxableIncome - 100000;
        const allowanceLost = excess / 2;
        const taxCost = allowanceLost * 0.40;
        return {
            active: true,
            message: `You are in the 60% Tax Trap! You've lost £${allowanceLost.toLocaleString()} of Personal Allowance.`,
            advice: `Increasing pension/sacrifice by £${excess.toLocaleString()} saves £${(taxCost + (excess * 0.4)).toLocaleString()} in tax.`
        };
    }
    return { active: false };
};
