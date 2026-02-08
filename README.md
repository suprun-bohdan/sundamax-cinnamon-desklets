# sundamax Cinnamon Desklets

Personal collection of Cinnamon desktop desklets.

## Desklets

| Desklet | Description |
|---------|-------------|
| **auroraTracker@sundamax** | Aurora forecast and Kp index on world map via NOAA SWPC API. OVATION heatmap, planetary Kp. |
| **currencyRates@sundamax** | Global exchange rates via Frankfurter API. Configurable base currency and 3 target currencies. Update interval 1s–60min. |
| **diskUsage@sundamax** | Displays disk usage for all mounted drives in Windows 11 style with dark/light theme. |
| **earthquakeTracker@sundamax** | Iceland earthquake monitoring via Skjálftalísa API (vedur.is). Data by Icelandic Met Office. CC BY-SA 4.0. |
| **issTracker@sundamax** | Real-time ISS position on world map via wheretheiss.at API. Updates every 1–10 seconds. |
| **serverPing@sundamax** | Monitor server availability by TCP port. Shows status lights (green/red) for each host:port. |
| **worldClock@sundamax** | Digital clock for selected timezone. |

## Installation

### Manual (from this repo)

```bash
git clone https://github.com/suprun-bohdan/sundamax-cinnamon-desklets.git
cd sundamax-cinnamon-desklets
mkdir -p ~/.local/share/cinnamon/desklets
cp -r auroraTracker@sundamax currencyRates@sundamax diskUsage@sundamax \
      earthquakeTracker@sundamax issTracker@sundamax serverPing@sundamax worldClock@sundamax \
      ~/.local/share/cinnamon/desklets/
```

### Add to desktop

1. Right-click on desktop → **Add Desklets**
2. Find the desired desklet in the list (Aurora Tracker, Currency Rates, Disk Usage, Earthquake Tracker, ISS Tracker, Server Ping, World Clock)
3. Double-click to add

## Requirements

- Cinnamon desktop environment
- Linux Mint or compatible distribution

## License

See individual desklet directories for license information.
