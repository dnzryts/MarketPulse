/* Stock universes scanned by Radar. Yahoo Finance symbols.
   Lists are large, liquid names (STI-linked, Nasdaq-100, Nifty 50) and may drift from the
   official index membership over time; edit freely. Each entry: [symbol, display name, news aliases...] */
window.UNIVERSE = {
  SGX: {index: '^STI', label: 'SGX', currency: 'SGD', news: 'Singapore stocks SGX', list: [
    ['D05.SI','DBS Group','DBS'], ['O39.SI','OCBC','OCBC'], ['U11.SI','UOB','UOB','United Overseas Bank'],
    ['Z74.SI','Singtel','Singtel'], ['S68.SI','SGX Group','Singapore Exchange'], ['S63.SI','ST Engineering','ST Engineering','ST Engg'],
    ['C6L.SI','Singapore Airlines','Singapore Airlines','SIA'], ['BN4.SI','Keppel','Keppel'], ['5E2.SI','Seatrium','Seatrium'],
    ['U96.SI','Sembcorp Industries','Sembcorp'], ['BS6.SI','Yangzijiang Shipbuilding','Yangzijiang'], ['F34.SI','Wilmar','Wilmar'],
    ['Y92.SI','Thai Beverage','ThaiBev','Thai Beverage'], ['G13.SI','Genting Singapore','Genting Singapore'], ['9CI.SI','CapitaLand Investment','CapitaLand Investment','CLI'],
    ['C38U.SI','CapitaLand Integrated Commercial Trust','CICT'], ['A17U.SI','CapitaLand Ascendas REIT','CLAR','Ascendas Reit'], ['M44U.SI','Mapletree Logistics Trust','Mapletree Logistics'],
    ['ME8U.SI','Mapletree Industrial Trust','Mapletree Industrial'], ['N2IU.SI','Mapletree Pan Asia Commercial Trust','Mapletree Pan Asia'], ['J69U.SI','Frasers Centrepoint Trust','Frasers Centrepoint'],
    ['BUOU.SI','Frasers Logistics & Commercial Trust','Frasers Logistics'], ['AJBU.SI','Keppel DC REIT','Keppel DC'], ['H78.SI','Hongkong Land','Hongkong Land'],
    ['C07.SI','Jardine Cycle & Carriage','Jardine Cycle'], ['V03.SI','Venture Corp','Venture Corp'], ['U14.SI','UOL Group','UOL'],
    ['C09.SI','City Developments','City Developments','CDL'], ['S58.SI','SATS','SATS'], ['C52.SI','ComfortDelGro','ComfortDelGro']
  ]},
  NASDAQ: {index: '^IXIC', label: 'NASDAQ', currency: 'USD', news: 'Nasdaq stocks', list: [
    ['AAPL','Apple','Apple'], ['MSFT','Microsoft','Microsoft'], ['NVDA','Nvidia','Nvidia','NVIDIA'], ['AMZN','Amazon','Amazon'],
    ['GOOGL','Alphabet','Alphabet','Google'], ['META','Meta Platforms','Meta'], ['AVGO','Broadcom','Broadcom'], ['TSLA','Tesla','Tesla'],
    ['COST','Costco','Costco'], ['NFLX','Netflix','Netflix'], ['AMD','AMD','AMD','Advanced Micro Devices'], ['PLTR','Palantir','Palantir'],
    ['ADBE','Adobe','Adobe'], ['PEP','PepsiCo','PepsiCo'], ['CSCO','Cisco','Cisco'], ['TMUS','T-Mobile US','T-Mobile'],
    ['INTC','Intel','Intel'], ['QCOM','Qualcomm','Qualcomm'], ['TXN','Texas Instruments','Texas Instruments'], ['AMGN','Amgen','Amgen'],
    ['INTU','Intuit','Intuit'], ['ISRG','Intuitive Surgical','Intuitive Surgical'], ['AMAT','Applied Materials','Applied Materials'], ['MU','Micron','Micron'],
    ['LRCX','Lam Research','Lam Research'], ['KLAC','KLA','KLA Corp'], ['PANW','Palo Alto Networks','Palo Alto Networks'], ['CRWD','CrowdStrike','CrowdStrike'],
    ['ADI','Analog Devices','Analog Devices'], ['SBUX','Starbucks','Starbucks'], ['GILD','Gilead','Gilead'], ['MELI','MercadoLibre','MercadoLibre'],
    ['BKNG','Booking Holdings','Booking Holdings'], ['VRTX','Vertex','Vertex Pharmaceuticals'], ['REGN','Regeneron','Regeneron'], ['ADP','ADP','Automatic Data Processing'],
    ['CDNS','Cadence','Cadence Design'], ['SNPS','Synopsys','Synopsys'], ['MRVL','Marvell','Marvell'], ['ABNB','Airbnb','Airbnb'],
    ['DASH','DoorDash','DoorDash'], ['FTNT','Fortinet','Fortinet'], ['PYPL','PayPal','PayPal'], ['MDLZ','Mondelez','Mondelez'],
    ['ASML','ASML','ASML'], ['ARM','Arm Holdings','Arm Holdings'], ['APP','AppLovin','AppLovin'], ['ZS','Zscaler','Zscaler'],
    ['DDOG','Datadog','Datadog'], ['TEAM','Atlassian','Atlassian'], ['SHOP','Shopify','Shopify'], ['SMCI','Super Micro Computer','Super Micro','Supermicro'],
    ['COIN','Coinbase','Coinbase'], ['MSTR','Strategy (MicroStrategy)','MicroStrategy']
  ]},
  NSE: {index: '^NSEI', label: 'NSE', currency: 'INR', news: 'NSE Nifty stocks India', list: [
    ['RELIANCE.NS','Reliance Industries','Reliance'], ['TCS.NS','TCS','TCS','Tata Consultancy'], ['HDFCBANK.NS','HDFC Bank','HDFC Bank'], ['ICICIBANK.NS','ICICI Bank','ICICI Bank'],
    ['INFY.NS','Infosys','Infosys'], ['BHARTIARTL.NS','Bharti Airtel','Bharti Airtel','Airtel'], ['ITC.NS','ITC','ITC Ltd','ITC Limited'], ['SBIN.NS','State Bank of India','SBI','State Bank of India'],
    ['LT.NS','Larsen & Toubro','Larsen','L&T'], ['HINDUNILVR.NS','Hindustan Unilever','HUL','Hindustan Unilever'], ['BAJFINANCE.NS','Bajaj Finance','Bajaj Finance'], ['KOTAKBANK.NS','Kotak Mahindra Bank','Kotak'],
    ['AXISBANK.NS','Axis Bank','Axis Bank'], ['HCLTECH.NS','HCLTech','HCLTech','HCL Tech'], ['MARUTI.NS','Maruti Suzuki','Maruti'], ['SUNPHARMA.NS','Sun Pharma','Sun Pharma'],
    ['M&M.NS','Mahindra & Mahindra','Mahindra','M&M'], ['TITAN.NS','Titan Company','Titan'], ['ULTRACEMCO.NS','UltraTech Cement','UltraTech'], ['NTPC.NS','NTPC','NTPC'],
    ['ASIANPAINT.NS','Asian Paints','Asian Paints'], ['POWERGRID.NS','Power Grid','Power Grid'], ['ONGC.NS','ONGC','ONGC'], ['WIPRO.NS','Wipro','Wipro'],
    ['ADANIENT.NS','Adani Enterprises','Adani Enterprises'], ['ADANIPORTS.NS','Adani Ports','Adani Ports'], ['JSWSTEEL.NS','JSW Steel','JSW Steel'], ['TATASTEEL.NS','Tata Steel','Tata Steel'],
    ['COALINDIA.NS','Coal India','Coal India'], ['NESTLEIND.NS','Nestle India','Nestle India'], ['BAJAJFINSV.NS','Bajaj Finserv','Bajaj Finserv'], ['TECHM.NS','Tech Mahindra','Tech Mahindra'],
    ['GRASIM.NS','Grasim','Grasim'], ['HINDALCO.NS','Hindalco','Hindalco'], ['CIPLA.NS','Cipla','Cipla'], ['DRREDDY.NS',"Dr. Reddy's","Dr Reddy","Dr. Reddy's"],
    ['EICHERMOT.NS','Eicher Motors','Eicher'], ['BEL.NS','Bharat Electronics','Bharat Electronics'], ['TRENT.NS','Trent','Trent Ltd'], ['SBILIFE.NS','SBI Life','SBI Life'],
    ['HDFCLIFE.NS','HDFC Life','HDFC Life'], ['APOLLOHOSP.NS','Apollo Hospitals','Apollo Hospitals'], ['BAJAJ-AUTO.NS','Bajaj Auto','Bajaj Auto'], ['HEROMOTOCO.NS','Hero MotoCorp','Hero MotoCorp'],
    ['SHRIRAMFIN.NS','Shriram Finance','Shriram Finance'], ['BRITANNIA.NS','Britannia','Britannia'], ['TATACONSUM.NS','Tata Consumer','Tata Consumer'], ['INDUSINDBK.NS','IndusInd Bank','IndusInd'],
    ['JIOFIN.NS','Jio Financial','Jio Financial'], ['ETERNAL.NS','Eternal (Zomato)','Zomato','Eternal Ltd']
  ]}
};

/* Sector for each symbol, used by the heatmap and relative-strength views. */
window.SECTORS = (() => {
  const g = {
    'Banks & finance': 'D05.SI O39.SI U11.SI S68.SI HDFCBANK.NS ICICIBANK.NS SBIN.NS KOTAKBANK.NS AXISBANK.NS BAJFINANCE.NS BAJAJFINSV.NS SBILIFE.NS HDFCLIFE.NS SHRIRAMFIN.NS INDUSINDBK.NS JIOFIN.NS PYPL COIN MSTR',
    'Real estate & REITs': 'C38U.SI A17U.SI M44U.SI ME8U.SI N2IU.SI J69U.SI BUOU.SI AJBU.SI 9CI.SI H78.SI U14.SI C09.SI',
    'Telecom & media': 'Z74.SI BHARTIARTL.NS TMUS NFLX META GOOGL',
    'Industrials': 'S63.SI BN4.SI 5E2.SI BS6.SI U96.SI C07.SI S58.SI C52.SI C6L.SI LT.NS BEL.NS ADP',
    'Consumer': 'F34.SI Y92.SI G13.SI ITC.NS HINDUNILVR.NS TITAN.NS ASIANPAINT.NS NESTLEIND.NS BRITANNIA.NS TATACONSUM.NS TRENT.NS ETERNAL.NS COST PEP SBUX MDLZ BKNG ABNB DASH MELI AMZN',
    'Autos': 'MARUTI.NS M&M.NS EICHERMOT.NS BAJAJ-AUTO.NS HEROMOTOCO.NS TSLA',
    'Semiconductors': 'NVDA AVGO AMD INTC QCOM TXN AMAT MU LRCX KLAC ADI MRVL ASML ARM SMCI V03.SI',
    'Software & IT': 'MSFT AAPL ADBE CSCO INTU PANW CRWD CDNS SNPS FTNT ZS DDOG TEAM SHOP APP PLTR TCS.NS INFY.NS HCLTECH.NS WIPRO.NS TECHM.NS',
    'Healthcare': 'AMGN ISRG GILD VRTX REGN SUNPHARMA.NS CIPLA.NS DRREDDY.NS APOLLOHOSP.NS',
    'Energy & materials': 'RELIANCE.NS ONGC.NS NTPC.NS POWERGRID.NS COALINDIA.NS ADANIENT.NS ADANIPORTS.NS JSWSTEEL.NS TATASTEEL.NS HINDALCO.NS GRASIM.NS ULTRACEMCO.NS'
  };
  const m = {};
  for (const [sec, list] of Object.entries(g)) for (const s of list.split(' ')) m[s] = sec;
  return m;
})();
