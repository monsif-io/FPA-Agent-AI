const ONES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const TEENS = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'];

function convertUnder100(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  
  const ten = Math.floor(n / 10);
  const remainder = n % 10;
  
  if (ten === 7) {
    const isOne = remainder === 1;
    return `soixante-${isOne ? 'et-onze' : convertUnder100(10 + remainder)}`;
  }
  
  if (ten === 9) {
    return `quatre-vingt-${convertUnder100(10 + remainder)}`;
  }
  
  if (remainder === 0) {
    if (ten === 8) return 'quatre-vingts';
    return TENS[ten];
  }
  
  if (remainder === 1) {
    return `${TENS[ten]}-et-un`;
  }
  
  return `${TENS[ten]}-${ONES[remainder]}`;
}

function convertUnder1000(n: number): string {
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  
  let result = '';
  
  if (hundred > 0) {
    if (hundred === 1) {
      result = 'cent';
    } else {
      result = `${ONES[hundred]}-cent`;
      if (remainder === 0) {
        result += 's';
      }
    }
  }
  
  if (remainder > 0) {
    if (result) result += ' ';
    result += convertUnder100(remainder);
  }
  
  return result;
}

function convertInteger(n: number): string {
  if (n === 0) return 'zéro';
  
  let parts: string[] = [];
  
  // Billions (Milliards)
  const billions = Math.floor(n / 1000000000);
  n %= 1000000000;
  if (billions > 0) {
    parts.push(`${convertUnder1000(billions)} milliard${billions > 1 ? 's' : ''}`);
  }
  
  // Millions
  const millions = Math.floor(n / 1000000);
  n %= 1000000;
  if (millions > 0) {
    parts.push(`${convertUnder1000(millions)} million${millions > 1 ? 's' : ''}`);
  }
  
  // Thousands (Mille)
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('mille');
    } else {
      parts.push(`${convertUnder1000(thousands)} mille`);
    }
  }
  
  // Hundreds
  if (n > 0) {
    parts.push(convertUnder1000(n));
  }
  
  return parts.join(' ');
}

export function numberToWordsFr(num: number): string {
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  
  const integerPart = Math.floor(absNum);
  const decimalPart = Math.round((absNum - integerPart) * 100);
  
  let result = convertInteger(integerPart);
  
  if (isNegative) {
    result = 'moins ' + result;
  }
  
  if (decimalPart > 0) {
    result += ` et ${convertInteger(decimalPart)} centime${decimalPart > 1 ? 's' : ''}`;
  }
  
  // Capitalize first letter
  return result.charAt(0).toUpperCase() + result.slice(1);
}
