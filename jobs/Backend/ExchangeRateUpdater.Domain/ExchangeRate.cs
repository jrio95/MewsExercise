﻿namespace ExchangeRateUpdater.Domain
{
    public class ExchangeRate
    {
        private ExchangeRate(Currency sourceCurrency, Currency targetCurrency, decimal value)
        {
            SourceCurrency = sourceCurrency;
            TargetCurrency = targetCurrency;
            Value = value;
        }

        public static ExchangeRate Create(Currency sourceCurrency, Currency targetCurrency, decimal value)
        {
            return new ExchangeRate(sourceCurrency, targetCurrency, value);
        }

        public Currency SourceCurrency { get; }

        public Currency TargetCurrency { get; }

        public decimal Value { get; }
    }
}
