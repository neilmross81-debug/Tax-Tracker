/**
 * UK Tax Calculator 2024/25 & 2025/26 - v14.0 Logic
 * Features: Student Loans, Child Benefit (HICBC), Multi-Year, Sandbox comparison.
 */

const round = (val) => Math.round(val * 100) / 100;

const CONSTANTS = {
    '2024/25': {
        niMainRate: 0.08,
        paThreshold: 100000,
        paMax: 12570,
        basicRateLimit: 37700, // Total 50270
        higherRateLimit: 125140,
        niThreshold: 12570,
        niUpperLimit: 50270
    },
    '2025/26': {
        niMainRate: 0.08,
        paThreshold: 100000,
        paMax: 12570,
        basicRateLimit: 37700,
        higherRateLimit: 125140,
        niThreshold: 12570,
        niUpperLimit: 50270
    }
};

const STUDENT_LOAN_PLANS = {
    '2024/25': {
        'plan1': { threshold: 24990, rate: 0.09 },
        'plan2': { threshold: 27295, rate: 0.09 },
        'plan4': { threshold: 31395, rate: 0.09 },
        'plan5': { threshold: 25000, rate: 0.09 },
        'pgl': { threshold: 21000, rate: 0.06 }
    },
    '2025/26': {
        'plan1': { threshold: 25725, rate: 0.09 }, // 25/26 threshold
        'plan2': { threshold: 28310, rate: 0.09 }, // 25/26 threshold
        'plan4': { threshold: 32345, rate: 0.09 }, // 25/26 threshold
        'plan5': { threshold: 25000, rate: 0.09 },
        'pgl': { threshold: 21000, rate: 0.06 }
    }
};

export const parseTaxCode = (code) => {
    const cleanCode = code.toUpperCase().trim();
    if (cleanCode === 'BR') return 0;
    if (cleanCode === 'D0') return -999999;
    if (cleanCode === 'D1') return -9999999;
    if (cleanCode === 'NT') return 1000000;

    const match = cleanCode.match(/(-?\d+)/);
    if (match) {
        let value = parseInt(match[1]) * 10;
        if (cleanCode.startsWith('K')) {
            // If the math matched a positive number but it's a K code, negate it
            // If they typed K-100 it's already negative, so Math.abs ensures we negate the absolute value
            return -Math.abs(value);
        }
        return value;
    }
    return 12570;
};

export const recommendTaxCode = (ani) => {
    if (ani > 125140) return 'D0';
    if (ani > 100000) {
        const excess = ani - 100000;
        const reduction = Math.min(12570, Math.floor(excess / 2));
        const newAllowance = 12570 - reduction;
        if (newAllowance <= 0) return '0T';
        return `${Math.floor(newAllowance / 10)}L`;
    }
    return '1257L';
};

/**
 * Main Calculation Engine
 */
export const calculateTax = (annualGross, pensionContribution = 0, salarySacrifice = 0, taxCode = '1257L', netDeductions = 0, options = {}) => {
    const year = options.taxYear || '2025/26';
    const config = CONSTANTS[year] || CONSTANTS['2025/26'];

    // Adjusted Net Income (ANI) for PA Taper & HICBC
    const ani = Math.max(0, annualGross - pensionContribution - salarySacrifice);

    // Taxable Income (ANI - Allowances)
    let baseAllowance = parseTaxCode(taxCode);
    let personalAllowance = baseAllowance;

    if (ani > config.paThreshold && personalAllowance > 0) {
        const reduction = Math.min(personalAllowance, (ani - config.paThreshold) / 2);
        personalAllowance -= reduction;
    }

    let workingTaxable = ani;
    if (baseAllowance < 0) {
        workingTaxable += Math.abs(baseAllowance);
        personalAllowance = 0;
    }

    let incomeTax = 0;
    let remainingTaxable = workingTaxable - personalAllowance;

    if (remainingTaxable > 0) {
        const basicRateBand = Math.min(remainingTaxable, config.basicRateLimit);
        incomeTax += basicRateBand * 0.20;
        remainingTaxable -= basicRateBand;

        if (remainingTaxable > 0) {
            const higherRateBand = Math.min(remainingTaxable, config.higherRateLimit - (config.paMax + config.basicRateLimit));
            incomeTax += higherRateBand * 0.40;
            remainingTaxable -= higherRateBand;

            if (remainingTaxable > 0) {
                incomeTax += remainingTaxable * 0.45;
            }
        }
    }

    // National Insurance - calculated on gross minus salary sacrifice (and pension if SS scheme)
    let ni = 0;
    const pensionIsSS = options.pensionIsSS || false;
    const niableGross = Math.max(0, annualGross - salarySacrifice - (pensionIsSS ? pensionContribution : 0));
    if (niableGross > config.niThreshold) {
        const mainBand = Math.min(niableGross, config.niUpperLimit) - config.niThreshold;
        ni += mainBand * config.niMainRate;
        if (niableGross > config.niUpperLimit) {
            ni += (niableGross - config.niUpperLimit) * 0.02;
        }
    }


    // Student Loans
    let studentLoan = 0;
    if (options.studentLoanPlans && options.studentLoanPlans.length > 0) {
        const grossForSL = annualGross; // SL is calculated on gross after pension usually? Depends on pension type. Using Gross for simplicity as per common HMRC tools.
        const taxYear = options.taxYear || '2025/26';
        const yearSLConfig = STUDENT_LOAN_PLANS[taxYear] || STUDENT_LOAN_PLANS['2025/26'];

        options.studentLoanPlans.forEach(planKey => {
            const plan = yearSLConfig[planKey];
            if (plan && grossForSL > plan.threshold) {
                studentLoan += (grossForSL - plan.threshold) * plan.rate;
            }
        });
    }

    // HICBC (High Income Child Benefit Charge)
    let hicbc = 0;
    if (options.childBenefitCount > 0 && ani > 60000) {
        // Child Benefit Rates 24/25: £25.60/wk first, £16.95/wk others
        const weeklyBenefit = 25.60 + ((options.childBenefitCount - 1) * 16.95);
        const annualBenefit = weeklyBenefit * 52;

        // Charge is 1% for every £100 over £60k. Reaches 100% at £80k.
        const excess = ani - 60000;
        const percentage = Math.min(100, Math.floor(excess / 200)); // v14 logic: 24/25 rule is 1% per £200 over 60k? Actually it changed to 60-80k.
        // Rule: 1% for every £200. Reaches 100% at £80,000.
        hicbc = annualBenefit * (percentage / 100);
    }

    const totalDeductions = incomeTax + ni + studentLoan + hicbc + netDeductions;

    return {
        gross: round(annualGross),
        taxableIncome: round(ani),
        personalAllowance: round(personalAllowance),
        incomeTax: round(incomeTax),
        ni: round(ni),
        studentLoan: round(studentLoan),
        hicbc: round(hicbc),
        pensionContribution: round(pensionContribution),
        salarySacrifice: round(salarySacrifice),
        netDeductions: round(netDeductions),
        totalTaxNI: round(incomeTax + ni),
        annualTakeHome: round(ani - incomeTax - ni - studentLoan - hicbc - netDeductions),
        monthlyTakeHome: round((ani - incomeTax - ni - studentLoan - hicbc - netDeductions) / 12)
    };
};

export const calculateOvertime = (annualSalary, contractedHours, otHours, multiplier) => {
    if (!contractedHours || contractedHours <= 0) return 0;
    const hourlyRate = (annualSalary / 52) / contractedHours;
    return round(hourlyRate * (otHours || 0) * multiplier);
};



export const projectAnnual = (monthsActualData, futureBaseData, currentMonthIndex, taxCode, options = {}) => {
    let ytdGross = 0;
    let ytdPension = 0;
    let ytdSacrifice = 0;
    let ytdNetDeductions = 0;
    let ytdTaxFree = 0;

    for (let i = 0; i <= currentMonthIndex; i++) {
        const m = monthsActualData[i];
        ytdGross += m.gross;

        if (!options.omitAllPension) {
            ytdPension += m.pension;
        }

        let monthSac = m.deductionItems.filter(d => d.type === 'salary_sacrifice').reduce((s, item) => s + Number(item.amount || 0), 0) + m.rawMonthsActual.deductions.filter(d => d.type === 'salary_sacrifice').reduce((s, item) => s + Number(item.amount || 0), 0);
        if (options.omitAllSacrifice) monthSac = 0;
        else if (options.omitSpecificSacrificeAmount) monthSac = Math.max(0, monthSac - options.omitSpecificSacrificeAmount);
        ytdSacrifice += monthSac;

        ytdNetDeductions += m.deductionItems.filter(d => d.type === 'net_sacrifice').reduce((s, item) => s + Number(item.amount || 0), 0) + m.rawMonthsActual.deductions.filter(d => d.type === 'net_sacrifice').reduce((s, item) => s + Number(item.amount || 0), 0);
        ytdTaxFree += m.taxFree;
    }

    const remaining = 11 - currentMonthIndex;
    if (remaining > 0) {
        ytdGross += (futureBaseData.gross * remaining);
        if (!options.omitAllPension) {
            ytdPension += (futureBaseData.pension * remaining);
        }

        let futSac = futureBaseData.grossSacrifice;
        if (options.omitAllSacrifice) futSac = 0;
        else if (options.omitSpecificSacrificeAmount) futSac = Math.max(0, futSac - options.omitSpecificSacrificeAmount);
        ytdSacrifice += (futSac * remaining);

        ytdNetDeductions += (futureBaseData.netSacrifice * remaining);
        ytdTaxFree += (futureBaseData.taxFree * remaining);
    }

    const taxResults = calculateTax(ytdGross, ytdPension, ytdSacrifice, taxCode, ytdNetDeductions, options);

    return {
        ...taxResults,
        projectedTaxFree: round(ytdTaxFree),
        finalTakeHome: round(taxResults.annualTakeHome + ytdTaxFree)
    };
};

export const getTaxTrapAdvice = (ani, currentPensionPercent, annualGross, currentTaxCode) => {
    if (ani > 100000 && ani < 125140) {
        const excess = ani - 100000;
        const allowanceLost = excess / 2;
        const netTaxImpact = (allowanceLost * 0.40) + (excess * 0.40);

        const percentageIncrease = (excess / annualGross) * 100;
        const suggestedPension = Math.ceil(currentPensionPercent + percentageIncrease);
        const correctCode = recommendTaxCode(ani);
        const isCodeMismatch = currentTaxCode.toUpperCase().trim() !== correctCode.toUpperCase().trim();

        return {
            active: true,
            excessAmount: round(excess),
            allowanceLost: round(allowanceLost),
            potentialSaving: round(netTaxImpact),
            message: `Adjusted Net Income: £${round(ani).toLocaleString()} is in the 60% Tax Trap bracket.`,
            isCodeMismatch,
            correctCode,
            options: [
                {
                    label: "Additional Pension",
                    value: `Increase pension contribution to ${suggestedPension}%`,
                    type: "pension"
                },
                {
                    label: "Cycle to Work",
                    value: `Scheme value up to £${round(excess).toLocaleString()} (Annually)`,
                    type: "scheme"
                },
                {
                    label: "EV Car Lease",
                    value: `Sacrifice £${round(excess / 12).toLocaleString()} per month for an EV`,
                    type: "scheme"
                },
                {
                    label: "Update Tax Code",
                    value: isCodeMismatch
                        ? `Switch to ${correctCode} to avoid a tax bill if not sacrificing.`
                        : `Your code ${currentTaxCode} is already correctly aligned.`,
                    type: "warning",
                    highlight: isCodeMismatch
                }
            ]
        };
    }
    return { active: false };
};
