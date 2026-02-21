/**
 * UK Tax Calculator 2025/26 - Projections & Monthly Support
 */

export const calculateTax = (annualGross, pensionContribution = 0, salarySacrifice = 0) => {
    const taxableIncome = Math.max(0, annualGross - pensionContribution - salarySacrifice);

    let personalAllowance = 12570;
    if (taxableIncome > 100000) {
        const reduction = Math.min(personalAllowance, (taxableIncome - 100000) / 2);
        personalAllowance -= reduction;
    }

    let incomeTax = 0;
    let remainingTaxable = taxableIncome - personalAllowance;

    if (remainingTaxable > 0) {
        const basicRateBand = Math.min(remainingTaxable, 50270 - 12570);
        incomeTax += basicRateBand * 0.20;
        remainingTaxable -= basicRateBand;

        if (remainingTaxable > 0) {
            const higherRateBand = Math.min(remainingTaxable, 125140 - 50270);
            incomeTax += higherRateBand * 0.40;
            remainingTaxable -= higherRateBand;

            if (remainingTaxable > 0) {
                incomeTax += remainingTaxable * 0.45;
            }
        }
    }

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
 * Project Annual Income based on YTD and remaining months
 */
export const projectAnnual = (monthsData, currentMonthIndex) => {
    let ytdGross = 0;
    let ytdPension = 0;
    let ytdSacrifice = 0;

    // 1. Calculate YTD (Months up to current)
    for (let i = 0; i <= currentMonthIndex; i++) {
        const month = monthsData[i];
        ytdGross += month.income.reduce((s, item) => s + Number(item.amount), 0);
        ytdPension += month.deductions.reduce((s, item) => s + (item.type === 'pension' ? Number(item.amount) : 0), 0);
        ytdSacrifice += month.deductions.reduce((s, item) => s + (item.type !== 'pension' ? Number(item.amount) : 0), 0);
    }

    // 2. Project Remaining (Months after current)
    // Assuming the user wants to project based on the *current* month's values for remaining
    const remainingMonths = 11 - currentMonthIndex;
    const currentMonth = monthsData[currentMonthIndex];
    const monthlyGross = currentMonth.income.reduce((s, item) => s + Number(item.amount), 0);
    const monthlyPension = currentMonth.deductions.reduce((s, item) => s + (item.type === 'pension' ? Number(item.amount) : 0), 0);
    const monthlySacrifice = currentMonth.deductions.reduce((s, item) => s + (item.type !== 'pension' ? Number(item.amount) : 0), 0);

    const projectedGross = ytdGross + (monthlyGross * remainingMonths);
    const projectedPension = ytdPension + (monthlyPension * remainingMonths);
    const projectedSacrifice = ytdSacrifice + (monthlySacrifice * remainingMonths);

    return calculateTax(projectedGross, projectedPension, projectedSacrifice);
};

export const getTaxTrapAdvice = (projectedTaxableIncome) => {
    if (projectedTaxableIncome > 100000 && projectedTaxableIncome < 125140) {
        const excess = projectedTaxableIncome - 100000;
        const allowanceLost = excess / 2;
        const taxCost = allowanceLost * 0.40; // The 40% tax on the lost allowance makes it 60% effective

        return {
            active: true,
            message: `You are in the 60% Tax Trap! You've lost £${allowanceLost.toLocaleString()} of your Personal Allowance.`,
            advice: `Increasing pension contributions by £${excess.toLocaleString()} would recover your full allowance and save you £${(taxCost + (excess * 0.4)).toLocaleString()} in tax.`
        };
    }
    return { active: false };
};
