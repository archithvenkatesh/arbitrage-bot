// Mock data for demonstration purposes
// This simulates real API responses from PolyRouter

const MOCK_DATA = {
    kalshi: [
        {
            id: "KXWARMING-50",
            title: "Will the world pass 2 degrees Celsius over pre-industrial levels before 2050?",
            question: "Will the world pass 2 degrees Celsius over pre-industrial levels before 2050?",
            yes_price: 0.79,
            no_price: 0.21,
            volume_24h: 3,
            status: "open",
            platform: "kalshi"
        },
        {
            id: "KXMARSVRAIL-50",
            title: "Will a human land on Mars before California starts high-speed rail?",
            question: "Will a human land on Mars before California starts high-speed rail?",
            yes_price: 0.18,
            no_price: 0.82,
            volume_24h: 23,
            status: "open",
            platform: "kalshi"
        },
        {
            id: "KXTRUMP-JAIL-25",
            title: "Will Trump be convicted before 2025?",
            question: "Will Trump be convicted before 2025?",
            yes_price: 0.12,
            no_price: 0.88,
            volume_24h: 150,
            status: "open",
            platform: "kalshi"
        }
    ],
    polymarket: [
        {
            id: "516717",
            title: "Nuclear weapon detonation in 2025?",
            question: "Nuclear weapon detonation in 2025?",
            yes_price: 0.004,
            no_price: 0.996,
            volume_24h: 7473.98,
            status: "open",
            platform: "polymarket"
        },
        {
            id: "516719",
            title: "Russia x Ukraine ceasefire in 2025?",
            question: "Russia x Ukraine ceasefire in 2025?",
            yes_price: 0.0175,
            no_price: 0.9825,
            volume_24h: 479378.01,
            status: "open",
            platform: "polymarket"
        },
        {
            id: "516720",
            title: "Putin out as President of Russia in 2025?",
            question: "Putin out as President of Russia in 2025?",
            yes_price: 0.004,
            no_price: 0.996,
            volume_24h: 32558.09,
            status: "open",
            platform: "polymarket"
        },
        {
            id: "516800",
            title: "Will the world pass 2°C warming before 2050?",
            question: "Will the world pass 2°C warming before 2050?",
            yes_price: 0.75,
            no_price: 0.25,
            volume_24h: 1250.50,
            status: "open",
            platform: "polymarket"
        },
        {
            id: "516801",
            title: "Will humans land on Mars before high-speed rail in California?",
            question: "Will humans land on Mars before high-speed rail in California?",
            yes_price: 0.22,
            no_price: 0.78,
            volume_24h: 890.25,
            status: "open",
            platform: "polymarket"
        }
    ]
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MOCK_DATA;
}
