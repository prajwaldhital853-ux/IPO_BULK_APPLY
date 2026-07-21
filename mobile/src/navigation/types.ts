import type { NavigatorScreenParams } from '@react-navigation/native';
import type { StockListKind } from '../services/nepse/screener';
import type { PremiumScreenerKind } from '../services/nepse/premiumScreeners';
import type { PremiumToolKind } from '../services/nepse/premiumServices';
import type { ExtraToolKind } from '../services/nepse/extraData';

export type MainTabParamList = {
  Home: undefined;
  Apply: undefined;
  Services: undefined;
  Check: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  AddCapital: undefined;
  EditAccount: { accountId: string };
  BankDetail: undefined;
  CurrentIpoStatus: { mode?: 'status' | 'result' } | undefined;
  IpoBulkStatus: undefined;
  AllIpoStatus: undefined;
  CheckResultWeb: undefined;
  IpoStatusDetail: {
    accountId: string;
    report: import('../services/meroshare/types').ApplicationReportRow;
  };
  PublicIpoResult: undefined;
  NepseData:
    | {
        tab?: 'summary' | 'live' | 'movers' | 'today';
        query?: string;
        openSearch?: boolean;
      }
    | undefined;
  NepseCalendar: undefined;
  Portfolio: undefined;
  PortfolioDetail: { portfolioId: string };
  StockList: { kind: StockListKind };
  HighDemand: undefined;
  NepseHistory: undefined;
  BulkTransactions: undefined;
  ProposedDividend: undefined;
  Announcements: undefined;
  Charts: { symbol?: string } | undefined;
  Watchlist: undefined;
  StockDetail: { symbol: string };
  PriceAlert: undefined;
  BulkPortfolio: undefined;
  IpoIssues: { mode: 'current' | 'upcoming' };
  MeroshareWeb: undefined;
  TrackAccountExpiry: undefined;
  BankTracker: undefined;
  BankTrackerDetail: { accountId: string };
  ChangePassword: undefined;
  Subscription: undefined;
  AboutCompany: undefined;
  TeamMembers: undefined;
  Legal: { kind: 'terms' | 'privacy' };
  AdminLogin: undefined;
  AdminDashboard: undefined;
  AdminSettings: undefined;
  AdminTeam: undefined;
  AdminForgotPassword: undefined;
  AppSettings: undefined;
  FeedbackForm: { kind: 'feedback' | 'feature_request' };
  InvestmentSummary: undefined;
  AggressiveHolders: undefined;
  LiveMarketPulse: undefined;
  Accumulation: undefined;
  Distribution: undefined;
  TopBuyers: undefined;
  TopSellers: undefined;
  TopHolders: undefined;
  TopReleases: undefined;
  BrokerFavorites: undefined;
  BrokerTopBuySell: undefined;
  FiftyTwoWeekHigh: undefined;
  FiftyTwoWeekLow: undefined;
  PremiumScreener: { kind: PremiumScreenerKind };
  PremiumTool: { kind: PremiumToolKind };
  ExtraTool: { kind: ExtraToolKind };
  Calculator: undefined;
  FinancialNews: undefined;
  TmsBrokers: undefined;
};

export type DrawerParamList = {
  RootStack: NavigatorScreenParams<RootStackParamList> | undefined;
};
