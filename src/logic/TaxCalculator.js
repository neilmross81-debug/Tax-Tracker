/**
 * UK Tax Calculator 2025/26 - v11.0 Logic
 * Features: Expanded Sacrifice Advisor (EV, Cycle, Shares, Pension).
 */

const round = (val) => Math.round(val * 100) / 100;

export const parseTaxCode = (code) => {
    const cleanCode = code.toUpperCase().trim();
    if (cleanCode === 'BR') return 0;
    if (cleanCode === 'D0') return -999999;
    if (cleanCode === 'D1') return -9999999;
    if (cleanCode === 'NT') return 1000000;

    const match = cleanCode.match(/(\d+)/);
    if (match) {
        const value = parseInt(match[1]) * 10;
        if (cleanCode.startsWith('K')) return -value;
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

export const calculateTax = (annualGross, pensionContribution = 0, salarySacrifice = 0, taxCode = '1257L', netDeductions = 0) => {
    const taxableIncome = Math.max(0, annualGross - pensionContribution - salarySacrifice);
    let baseAllowance = parseTaxCode(taxCode);
    let personalAllowance = baseAllowance;

    if (taxableIncome > 100000 && personalAllowance > 0) {
        const reduction = Math.min(personalAllowance, (taxableIncome - 100000) / 2);
        personalAllowance -= reduction;
    }

    let workingTaxable = taxableIncome;
    if (baseAllowance < 0) {
        workingTaxable += Math.abs(baseAllowance);
        personalAllowance = 0;
    }

    let incomeTax = 0;
    let remainingTaxable = workingTaxable - personalAllowance;

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
            ni += (annualGross - 50270) * 0.02;
        }
    }

    return {
        gross: round(annualGross),
        taxableIncome: round(taxableIncome),
        personalAllowance: round(personalAllowance),
        incomeTax: round(incomeTax),
        ni: round(ni),
        pensionContribution: round(pensionContribution),
        salarySacrifice: round(salarySacrifice),
        netDeductions: round(netDeductions),
        annualTakeHome: round(taxableIncome - incomeTax - ni - netDeductions),
        monthlyTakeHome: round((taxableIncome - incomeTax - ni - netDeductions) / 12)
    };
};

export const calculateOvertime = (annualSalary, contractedHours, otHours, multiplier) => {
    if (!contractedHours || contractedHours <= 0) return 0;
    const hourlyRate = (annualSalary / 52) / contractedHours;
    return round(hourlyRate * (otHours || 0) * multiplier);
};

export const projectAnnual = (monthsActualData, futureBaseData, currentMonthIndex, taxCode) => {
    let ytdGross = 0;
    let ytdPension = 0;
    let ytdSacrifice = 0;
    let ytdNetDeductions = 0;
    let ytdTaxFree = 0;

    for (let i = 0; i <= currentMonthIndex; i++) {
        const m = monthsActualData[i];
        ytdGross += m.income.reduce((s, item) => s + Number(item.amount || 0), 0);
        ytdPension += m.deductions.reduce((s, item) => s + (item.type === 'pension' ? Number(item.amount || 0) : 0), 0);
        ytdSacrifice += m.deductions.reduce((s, item) => s + (item.type === 'salary_sacrifice' ? Number(item.amount || 0) : 0), 0);
        ytdNetDeductions += m.deductions.reduce((s, item) => s + (item.type === 'net_sacrifice' ? Number(item.amount || 0) : 0), 0);
        ytdTaxFree += m.deductions.reduce((s, item) => s + (item.type === 'tax_free' ? Number(item.amount || 0) : 0), 0);
    }

    const remaining = 11 - currentMonthIndex;
    if (remaining > 0) {
        ytdGross += (futureBaseData.gross * remaining);
        ytdPension += (futureBaseData.pension * remaining);
        ytdSacrifice += (futureBaseData.grossSacrifice * remaining);
        ytdNetDeductions += (futureBaseData.netSacrifice * remaining);
        ytdTaxFree += (futureBaseData.taxFree * remaining);
    }

    const taxResults = calculateTax(ytdGross, ytdPension, ytdSacrifice, taxCode, ytdNetDeductions);

    return {
        ...taxResults,
        projectedTaxFree: round(ytdTaxFree),
        finalTakeHome: round(taxResults.annualTakeHome + ytdTaxFree)
    };
};

export const getTaxTrapAdvice = (ani, currentPensionPercent, annualGross) => {
    if (ani > 100000 && ani < 125140) {
        const excess = ani - 100000;
        const allowanceLost = excess / 2;
        const netTaxImpact = (allowanceLost * 0.40) + (excess * 0.40); // 40% on lost allowance + 40% on excess

        const percentageIncrease = (excess / annualGross) * 100;
        const suggestedPension = Math.ceil(currentPensionPercent + percentageIncrease);

        return {
            active: true,
            excessAmount: round(excess),
            allowanceLost: round(allowanceLost),
            potentialSaving: round(netTaxImpact),
            message: `Adjusted Net Income: £${round(ani).toLocaleString()} is in the 60% Tax Trap bracket.`,
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
                    value: `Sacrifice £${round(excess / 12).toLocaleString()} per month towards an EV Car`,
                    type: "scheme"
                },
                {
                    label: "Workplace Benefits",
                    value: `Opt-in for sacrificed Healthcare, Shares (SIP), or Dental`,
                    type: "scheme"
                }
            ]
        };
    }
    return { active: false };
};
