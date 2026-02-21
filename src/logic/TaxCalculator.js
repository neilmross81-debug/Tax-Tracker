/**
 * UK Tax Calculator 2025/26
 * Rules:
 * - Personal Allowance: £12,570 (Tapers by £1 for every £2 over £100k)
 * - Basic Rate (20%): £12,571 - £50,270
 * - Higher Rate (40%): £50,271 - £125,140
 * - Additional Rate (45%): > £125,140
 * - NI (Class 1 Employees): 8% up to £50,270, 2% above (Approximation using annual thresholds)
 */

export const calculateTax = (annualGross, pensionContribution = 0, salarySacrifice = 0) => {
    // Adjusted Gross for Tax (after salary sacrifice and pension if net pay)
    const taxableIncome = Math.max(0, annualGross - pensionContribution - salarySacrifice);

    // 1. Calculate Personal Allowance
    let personalAllowance = 12570;
    if (taxableIncome > 100000) {
        const reduction = Math.min(personalAllowance, (taxableIncome - 100000) / 2);
        personalAllowance -= reduction;
    }

    // 2. Calculate Income Tax
    let incomeTax = 0;
    let remainingTaxable = taxableIncome - personalAllowance;

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

    // 3. Calculate National Insurance
    // Assuming 2025/26 thresholds (Primary Threshold ~£12,570, UEL ~£50,270)
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

export const getPensionAdvice = (annualGross, currentPensionPercent) => {
    const current = calculateTax(annualGross, annualGross * (currentPensionPercent / 100));
    const increased = calculateTax(annualGross, annualGross * ((currentPensionPercent + 1) / 100));

    const takeHomeDifference = current.takeHome - increased.takeHome;
    const pensionDifference = (annualGross * 0.01); // 1% difference

    return {
        costOfOnePercent: takeHomeDifference,
        gainInPension: pensionDifference,
        efficiency: (pensionDifference / takeHomeDifference).toFixed(2) // How many £ in pension for every £ lost in take-home
    };
};
