const Products: { [key: string]: { barcode: string; mxik: string; packageCode: string } } = {
    "product1": {
        "barcode": "4780047860466",
        "mxik": "02004001004009016",
        "packageCode": "1397597"
    },
    "product2": {
        "barcode": "4780047861784",
        "mxik": "02004001004009008",
        "packageCode": "1398017"
    },
    "product3": {
        "barcode": "4620017455554",
        "mxik": "02007002003000000",
        "packageCode": "1491216"
    },
    "product4": {
        "barcode": "4690388123789",
        "mxik": "02004001004018021",
        "packageCode": "1396522"
    },
    "product5": {
        "barcode": "4690388119614",
        "mxik": "02004001004018022",
        "packageCode": "1396532"
    },
    "product6": {
        "barcode": "4690388122133",
        "mxik": "01905007001194001",
        "packageCode": "1389715"
    },
    "product7": {
        "barcode": "4690388122515",
        "mxik": "02008001002019004",
        "packageCode": "1396565"
    },  
    "product8": {
        "barcode": "4690388122577",
        "mxik": "00406001001058001",
        "packageCode": "1405185"
    },
    "product9": {
        "barcode": "4690388122119",
        "mxik": "02105001004071132",
        "packageCode": "1244066"
    },  
    "product10": {
        "barcode": "4690388122539",
        "mxik": "02008001002019001",
        "packageCode": "1397467"
    }
};

export function getRandomProduct() {
    const productKeys = Object.keys(Products);
    const randomIndex = Math.floor(Math.random() * productKeys.length);
    const randomProductKey = productKeys[randomIndex];
    return Products[randomProductKey];
}