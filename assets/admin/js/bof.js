const signalrMixin = {
    data: function () {
        return {
            wsc: null,
            sToken: null,
            signalRFlags: {
                status: signalR.HubConnectionState.Disconnected,
                orders: false,
                commentry: false,
                prices: false
            }
        }
    },
    created: function () {
        
    },
    computed: {
        isSignalREnabled: function () {
            return this.signalRFlags.orders ||
                this.signalRFlags.commentry ||
                this.signalRFlags.prices;
        },
        isSignalRConnected: function () {
            return this.wsc !== null &&
                this.signalRFlags.status === signalR.HubConnectionState.Connected;
        }
    },
    methods: {
        Connect: function () {
            const self = this;

            if (self.isSignalREnabled) {

                self.wsc = new signalR.HubConnectionBuilder()
                    .withUrl(SsocketUrl, {
                        accessTokenFactory: () => self.AccessTokenProvider()
                    })
                    .withAutomaticReconnect({
                        nextRetryDelayInMilliseconds: retryContext => {
                            let maxTimeToAttemptingToReconnect = 1000 * 60 * 60;
                            if (retryContext.elapsedMilliseconds < maxTimeToAttemptingToReconnect) {
                                if (retryContext.previousRetryCount === 0) {
                                    return 0;
                                } else if (retryContext.previousRetryCount === 1) {
                                    return 2000;
                                } else if (retryContext.previousRetryCount < 10) {
                                    return 5000;
                                } else {
                                    return 10000;
                                }
                            } else {
                                return null;
                            }
                        }
                    })
                    .configureLogging(signalR.LogLevel.Error)
                    .build();

                this.wsc.onclose(function () {
                    self.signalRFlags.status = self.wsc.state;
                });

                this.wsc.onreconnecting(function () {
                    self.signalRFlags.status = self.wsc.state;
                });

                this.wsc.onreconnected(function () {
                    self.signalRFlags.status = self.wsc.state;
                    self.SubscribeEvent();
                });

                if (self.signalRFlags.prices) {
                    this.wsc.on("ReceivePrices", function (marketData) {
                        if (marketData == null || marketData == undefined) {
                            return;
                        }

                        self.RenderSignalRPrices(marketData);
                    });

                    this.wsc.on("RemoveMarket", function (id) {
                        self.DeleteMarket(id);
                    });
                }

                if (self.signalRFlags.orders) {
                    this.wsc.on("ReceiveOrder", function (order) {
                        self.RenderOrder(order);
                    });

                    this.wsc.on("ReceivePosition", function (position) {
                        self.RenderAllPositions(position);
                    });
                }

                if (self.signalRFlags.commentry) {
                    this.wsc.on("ReceiveCommentry", function (Commentry) {
                        self.RenderCommentry(Commentry);
                    });

                    this.wsc.on("ClearCommentry", function (Commentry) {
                        self.ClearCommentry(Commentry);
                    });
                }

                this.StartSignalR();
            } else {
                self.signalRFlags.status = signalR.HubConnectionState.Connected;
            }
        },
        AccessTokenProvider: function () {
            return this.sToken;
        },
        StartSignalR: function () {
            if (this.wsc.state !== signalR.HubConnectionState.Disconnected) {
                return;
            }

            let self = this;

            this.wsc.start()
                .then(function () {
                    self.signalRFlags.status = self.wsc.state;

                    self.SubscribeEvent();
                })
                .catch(function (err) {
                    setTimeout(() => self.StartSignalR(), 3000);
                });
        },
        SubscribeEvent: function () {
            const self = this;

            if (self.isSignalRConnected && self.signalRFlags.orders) {
                this.wsc.invoke(
                    "SubscribeOrders",
                    { eventId: self.activeEventId, marketId: self.activeMarketId, timeCode: self.timeCode });
            }
        },
    }
}
﻿/*! WebEx Market
* 2019 BetPro
*/
const marketStore = new Vuex.Store({
    state: {
        eventId: '',
        marketId: '',
        userId: 0,
        marketType: ''
    },
    mutations: {

    },
    // store.getters.lineMarkets
    getters: {
        // lineMarkets: state => {
            // return state.markets.filter(market => market.IsLine);
        // }
    }
});

var backColor = '227,248,255';
var layColor = '255,205,204';
var plusFlash = '248,245,33';
var minusFlash = '248,245,33';
var OldPrice = 0;
var menuTrail = [];
var LastNavItems = [];
var MarketPL = [];

function SaveNavTrail(id, type) {
    if (id === "0" || type === "0") {
        menuTrail = [];
    }
    else {
        // Is item in MenuTrail?
        var index = menuTrail.findIndex(function (item) { return item.id === id; });
        if (index >= 0) {
            menuTrail = menuTrail.slice(0, index + 1);
        } else {
            var navItem = LastNavItems.find(function (x) { return x.id === id.toString(); });
            if (navItem !== null && navItem !== undefined) {
                menuTrail.push(navItem);
            }
        }
    }
}

$(document).ready(function () {
    var router2 = new Navigo(null, true, "#!");
    router2
        .on({
            ':id/:type': function (params) {
                SaveNavTrail(params.id, params.type);
                GetSports(params.id, params.type);
            },
            ':id': function (params) {
                GetMarket(params.id);
            }
        })
        .resolve();

    // A simple background color flash effect that uses jQuery Color plugin
    jQuery.fn.flash = function (bgcolor, color, duration) {
        var current = this.css('backgroundColor');
        this.css('backgroundColor', 'rgb(' + color + ')')
            .animate({ backgroundColor: 'rgb(' + bgcolor + ')' }, duration);
    };

    GetSports(0, 0);
});

if ($("#MarketData").length > 0) {
    MarketVue = new Vue({
        el: "#MarketData",
        data: {
            market: {
                event: {},
                runners: []
            },
            runnerUnavailable: ['suspended', 'ball running', 'removed'],
            runners: [],
            startTime: '',
            status: '',
            scores: null,
            betDelay: 0,
            winners: 0,
            sinceStart: '',
            pos: [],
            IsLoaded: false,
            score: { team1: null, commentry: null },
            catalogues: [],
            scoreLines: [],
            isLine: false,
            IsVoice: false,
            bookmakerMarketName: "Bookmaker",
            LoadingSubMarkets: false,

            newMarketIds: [],
            removedMarketIds: [],
            renderedMarketIds: [],
            isRenderedBusy: false,

            MarketTypeFigure: "FIGURE",
            MarketTypeOddFigure: "ODD_FIGURE",
            MarketTypeFancy2: "LOCAL_FANCY",
            BetTypeFancy: "LINE",
            StarFancy: "StarFancy",
            MarketTypePlace: "PLACE",
            MarketTypeOtherPlace: "OTHER_PLACE",
            MarketTypeEachWay: "EACH_WAY",
            RaceId: 7,

            currentDateTime: ''
        },
        created: function () {
           document.getElementById("loadedmarkettoshow").classList.remove("d-none");
           // this.ListMarketData();
            this.start();
        },
        watch: {
            score: function (newVal, oldVal) {
                if (newVal !== undefined && newVal !== null && newVal.commentry !== null) {
                    if (oldVal.commentry !== newVal.commentry) {
                        this.PlayCommentry(newVal.commentry);
                    }
                }
            }
        },
        computed: {
            isRenderTopMarket: function () {
                if (this.market.marketName.toLowerCase() === "match odds" && this.market.marketId.startsWith('9.')) {
                    return false;
                } else {
                    return true;
                }
            },
            prettyDate: function () {
                if (this.startTime === '') return '';
                return moment(this.startTime).format('D MMM H:mm');
            },
            fromNow: function () {
                if (this.startTime === '') return '';
                return moment(this.startTime).fromNow();
            },
            CurrentMarketIdsHash: function () {
                var ids = _.map(this.catalogues, function (catalog) { return catalog.marketId; });
                ids = _.sortBy(ids, function (id) { return id; });
                return ids.join(',');
            },
            HasBookmakerMarket: function () {
                var m = _.find(this.catalogues, function (catalogue) {
                    return catalogue.marketName == this.bookmakerMarketName || catalogue.marketName == "BOOKMAKER" || catalogue.marketName.toLowerCase().includes("bookmaker");
                });

                return m !== undefined;
            },
            HasFigureMarket: function () {
                var m = _.find(this.catalogues, function (item) {
                    return item.marketType === "FIGURE";
                });
                return m !== undefined;
            },
            HasOddFigureMarkets: function () {
                return _.filter(this.catalogues, function (item) {
                    return item.marketType === "ODD_FIGURE";
                });
            },
            HasTossMarkets: function () {
                return _.filter(this.catalogues, function (item) {
                    return item.marketType === "TOSS";
                });
            },
            IsSoccer: function () {
                return this.market.eventTypeId == 1;
            },
            IsTennis: function () {
                return this.market.eventTypeId == 2;
            },
            SubMarketIds: function () {
                return _.map(this.catalogues, function (catalog) { return catalog.marketId; });
            },
            FancyMarkets: function () {
                var self = this;
                return _.filter(this.catalogues, function (item) {
                    return item.bettingType === self.BetTypeFancy;
                });
            },
            OtherMarkets: function () {
                var self = this;
                return _.filter(this.catalogues, function (item) {
                    if (item.marketName == null) return false;

                    return item.marketType !== self.MarketTypeFigure
                        && item.marketType !== self.MarketTypeOddFigure
                        && item.marketType !== "TOSS"
                        && item.bettingType !== self.BetTypeFancy
                        && item.marketName !== self.bookmakerMarketName
                        && item.marketType !== self.StarFancy
                        && !item.marketName.toLowerCase().includes("bookmaker");
                });
            }
        },
        methods: {
            IsRunnerDisabled: function (status) {
                if (status === undefined
                    || status === ''
                    || status === null) {
                    return false;
                }
                return this.runnerUnavailable.includes(status.toLowerCase());
            },
            GetDefaultStake: function () {
                var btnStake = $('.btn-stake')[0];
                if (btnStake) {
                    return $(btnStake).data('amount');
                }
                return 1000;
            },
            ResetPosition: function () {
                market.market.runners.forEach(function (runner) { runner.handicap = 0; });
            },
            FormatPosition: function () {
                market.market.runners.forEach(function (runner) { numeral(runner.handicap).format('0,0[.]00'); });
            },
            start: function () {
                var self = this;
                setInterval(self.ListMarketData, 1000);
                setInterval(self.RerenderSubMarkets, 1000);
            },
            FetchCatalogs: function (marketIds) {
                var params = marketIds.join(',');

                var qs = svc_prefix + 'markets/catalogs/?ids=' + params;

                var self = this;

                $.getJSON(qs, this.RenderSubMarkets).always(function () { self.isRenderedBusy = false; });
            },
            RenderSubMarkets: function (Catalogs) {
                var self = this;

                if (Catalogs != "undefined" && Catalogs !== null && Catalogs.length > 0) {
                    _.each(Catalogs, function (catalog) {
                        catalog['status2'] = null;
                        self.catalogues.push(catalog);
                    });
                    self.SortSubMarkets();
                }

                // this.isRenderedBusy = false;
            },
            ListMarketData: function () {
                var id = MarketId;
                var token = getCookie('wex3authtoken');
                var url = pricesUrl + "/Markets/Data?id=" + id + "&token=" + token;
                var self = this;
                
                $.ajax(url, {
                    timeout: 2000,
                    dataType: 'json',
                    success: function (result, textStatus, jqXhr) {
                        self.RenderMarketData(result);
                    },
                    error: function (jqXhr, textStatus, errorThrown) {

                    }
                });
            },
            RenderMarketData: function (MarketData) {
                var self = this;
                if (MarketData === null || MarketData.marketBooks.length === 0) return;

                var topMarketId = MarketId;
                var Book = _.find(MarketData.marketBooks, function (book) {
                    return book.id == topMarketId;
                });

                MarketVue.market.news = MarketData.news;
                MarketVue.startTime = typeof CurrentMarket === 'undefined' ? "" : CurrentMarket.marketStartTimeUtc;
                MarketVue.scores = MarketData.scores;
                MarketVue.sinceStart = moment(MarketVue.startTime).fromNow();
                MarketVue.score = MarketData.scoreboard;
                MarketVue.scoreLines = MarketData.fancy;

                if (typeof CurrentMarket !== 'undefined') {
                    let startTime = moment(CurrentMarket.marketStartTimeUtc);
                    let currentTime = moment(); // Current time
                    let duration = moment.duration(currentTime.diff(startTime));
                    let totalMinutes = Math.floor(duration.asMinutes());
                    let absoluteMinutes = Math.abs(totalMinutes);
                    let hours = ("0" + Math.floor(absoluteMinutes / 60)).slice(-2);
                    let minutes = ("0" + (absoluteMinutes % 60)).slice(-2);
                    let seconds = Math.abs(Math.floor(duration.asSeconds() % 60)).toString().padStart(2, '0');

                    let formattedTime = 'Elapsed: ';
                    if (totalMinutes < 0) {
                        formattedTime = 'Remaining: ';
                    }

                    formattedTime += (hours.toString().padStart(2, '0') + ":" + minutes.toString().padStart(2, '0') + ":" + seconds.toString().padStart(2, '0'));

                    this.currentDateTime = formattedTime;
                }

                if (Book !== undefined) {
                    MarketVue.market.totalMatched = Book.totalMatched;
                    MarketVue.status = Book.marketStatus;

                    MarketVue.betDelay = Book.betDelay;
                    MarketVue.winners = Book.winners;

                    MarketVue.market.runners.forEach(function (runner) {
                        let soldier = Book.runners.find(function (item) {
                            return item.id === runner.selectionId.toString();
                        });

                        self.SetRunner(runner, soldier, Book.id);
                    });
                }

                // Sub Markets
                if (MarketData.marketBooks.length > 0) {
                    self.ProcessSubMarkets(MarketData);

                } else {
                    this.catalogues = [];
                }
            },
            SetRunner: function (runner, soldier, marketId) {
                try {
                    let PL;
                    if (window.MarketPL !== null) {
                        PL = window.MarketPL.find(function (plItem) {
                            return plItem.selectionId === runner.selectionId
                                && plItem.marketId === marketId;
                        });
                    }
    
                    if (soldier !== undefined) {
                        if (soldier.status === 'WINNER') {
                            MarkWinner(soldier.id);
                        }
    
                        if (soldier.hasOwnProperty("size1")) {
                            soldier.size1 *= LiquidityRate;
                        }
    
                        if (soldier.hasOwnProperty("ls1")) {
                            soldier.ls1 *= LiquidityRate;
                        }
    
                        runner.price1 = UpdatePriceCell(runner.price1, soldier.price1, 'b1', soldier.id, backColor);
                        runner.size1 = UpdatePriceCell(runner.size1, soldier.size1, 'bs1', soldier.id, backColor);
    
                        runner.lay1 = UpdatePriceCell(runner.lay1, soldier.lay1, 'l1', soldier.id, layColor);
                        runner.ls1 = UpdatePriceCell(runner.ls1, soldier.ls1, 'ls1', soldier.id, layColor);
    
                        runner.price2 = soldier.price2;
                        if (soldier.hasOwnProperty("size2")) {
                            runner.size2 = soldier.size2 * LiquidityRate;
                        } else {
                            runner.size2 = null;
                        }
                        
                        runner.price3 = soldier.price3;
                        if (soldier.hasOwnProperty("size3")) {
                            runner.size3 = soldier.size3 * LiquidityRate;
                        } else {
                            runner.size3 = null;
                        }
                        
                        runner.lay2 = soldier.lay2;
                        runner.lay3 = soldier.lay3;
                        if (soldier.hasOwnProperty("ls2")) {
                            runner.ls2 = soldier.ls2 * LiquidityRate;
                        }
                        else {
                            runner.ls2 = null;
                        }
    
                        if (soldier.hasOwnProperty("ls3")) {
                            runner.ls3 = soldier.ls3 * LiquidityRate;
                        } else {
                            runner.ls3 = null;
                        }
    
                        if (PL) {
                            runner.ifWin = PL.ifWin;
                            runner.ifLose = PL.ifLose;
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            },
            ProcessSubMarkets: function (MarketData) {

                var self = this;

                var ActiveSubMarketIds = _.map(MarketData.marketBooks, function (book) { return book.id; });
                ActiveSubMarketIds = _.without(ActiveSubMarketIds, this.market.marketId);

                ActiveSubMarketIds = _.sortBy(ActiveSubMarketIds, function (id) { return id; });

                if (ActiveSubMarketIds.length > 0) {
                    _.each(MarketData.marketBooks, this.RenderSubMarketData);
                }

                var catalogsToRemove = _.filter(self.SubMarketIds, function (mid) {
                    return !ActiveSubMarketIds.includes(mid);
                });

                self.removedMarketIds = _.union(self.removedMarketIds, catalogsToRemove);

                self.newMarketIds = _.union(ActiveSubMarketIds, self.newMarketIds);
            },
            RerenderSubMarkets: function () {
                if (this.isRenderedBusy) {
                    return;
                }

                if (this.newMarketIds.length === 0) {
                    return;
                }

                this.isRenderedBusy = true;

                var self = this;

                self.RemoveCatalogues(self.removedMarketIds);


                this.newMarketIds = _.filter(this.newMarketIds, function (mid) {
                    return !self.removedMarketIds.includes(mid);
                });

                self.removedMarketIds = [];

                var catalogsToFetch = _.filter(this.newMarketIds, function (mid) {
                    return !self.SubMarketIds.includes(mid);
                });

                if (catalogsToFetch.length > 0) {
                    this.FetchCatalogs(catalogsToFetch);
                }
                else {
                    this.isRenderedBusy = false;
                }
            },
            SortSubMarkets: function () {
                var highPriority = _.filter(this.catalogues, function (sm) {
                    return sm.sortPriority == 1;
                });
                var lowPriority = _.filter(this.catalogues, function (sm) {
                    return sm.sortPriority != 1;
                });

                highPriority = _.sortBy(highPriority, 'marketName');
                lowPriority = _.sortBy(lowPriority, 'marketName');

                this.catalogues = _.union(highPriority, lowPriority);
            },
            LoadCatalogue: function (MarketId) {
                cat = _.find(this.catalogues, function (catalogue) {
                    return catalogue.marketId === MarketId;
                });
                if (cat === undefined) {
                    this.GetSubMarket(MarketId);
                }
            },
            GetSubMarket: function (MarketId) {
                console.log("GetSub: " + MarketId);
                var qs = svc_prefix + 'Markets/Catalog2/?id=' + MarketId;
                $.getJSON(qs, this.RenderSubMarket);
            },
            RenderSubMarket: function (Catalog) {
                if (Catalog !== undefined || Catalog !== null) {
                    this.catalogues.push(Catalog);
                }
            },
            RemoveCatalogues: function (RemovedMarketIds) {
                var self = this;
                _.each(RemovedMarketIds, function (mid) {
                    self.catalogues = _.filter(self.catalogues, function (catalog) {
                        return mid !== catalog.marketId;
                    });
                });
            },
            RenderSubMarketData: function (Book) {
                if (this.LoadingSubMarkets) return;
                market = _.find(this.catalogues, function (catalog) {
                    return catalog.marketId === Book.id;
                });
                if (market === undefined) return;
                market.status2 = Book.status2;
                market.status = Book.marketStatus;

                this.UpdateRunnerData(Book, market, window.MarketPL);
            },
            UpdateRunnerData: function (Book, Catalog, Pls) {
                if (Catalog === null || Catalog.runners === null) {
                    return;
                }

                var runnersCount = Catalog.runners.length;

                if (runnersCount === 0) {
                    return;
                }

                var self = this;

                for (let i = 0; i < runnersCount; i++) {

                    var soldier = Book.runners.find(function (item) {
                        return item.id === Catalog.runners[i].selectionId.toString();
                    });

                    if (Pls !== null) {
                        var PL = Pls.find(function (plItem) {
                            return plItem.selectionId === Catalog.runners[i].selectionId
                                && plItem.marketId === Book.id;
                        });
                    }

                    if (soldier !== undefined) {
                        if (soldier.status === 'WINNER') {
                            MarkWinner(soldier.id);
                        }

                        // self.UpdateRunnersPriceSize(Catalog.runners[i], soldier);
                        // UpdatePriceCell(runner.price1, soldier.price1, 'b1', soldier.id, backColor);

                        Catalog.runners[i].price1 = UpdatePriceCell(Catalog.runners[i].price1, soldier.price1, 'b1', soldier.id, backColor);
                        Catalog.runners[i].size1 = UpdatePriceCell(Catalog.runners[i].size1, soldier.size1, 'bs1', soldier.id, backColor);

                        Catalog.runners[i].lay1 = UpdatePriceCell(Catalog.runners[i].lay1, soldier.lay1, 'l1', soldier.id, layColor);
                        Catalog.runners[i].ls1 = UpdatePriceCell(Catalog.runners[i].ls1, soldier.ls1, 'ls1', soldier.id, layColor);

                        Catalog.runners[i].price2 = soldier.price2;
                        Catalog.runners[i].size2 = soldier.size2;
                        Catalog.runners[i].price3 = soldier.price3;
                        Catalog.runners[i].size3 = soldier.size3;
                        Catalog.runners[i].lay2 = soldier.lay2;
                        Catalog.runners[i].lay3 = soldier.lay3;
                        Catalog.runners[i].ls2 = soldier.ls2;
                        Catalog.runners[i].ls3 = soldier.ls3;

                        Catalog.runners[i].status = soldier.status;

                        if (PL !== undefined) {
                            if (PL.ifWin != Catalog.runners[i].ifWin) {
                                var runner = Catalog.runners[i];
                                runner.ifWin = PL.ifWin;
                                runner.ifLose = PL.ifLose;

                                this.$set(Catalog.runners, i, runner);
                            }
                        } else {
                            Catalog.runners[i].ifWin = '';
                            Catalog.runners[i].ifLose = '';
                        }
                    }
                }
            },
            GetFullLinePosition: function (marketId) {
                var qs = svc_prefix + 'Orders/LinePosition?MarketId=' + marketId;
                $.getJSON(qs, this.RenderLinePosition);
            },
            RenderLinePosition: function (result) {
                this.scoreLines = result;
            },
            fullBook: function (marketId) {
                // ShowFancyPosition();
                var url = "/Common/Position?id=" + marketId;
                newwindow = window.open(url, "Fancy Position " + marketId, 'height=500,width=400,titlebar=0,menubar=0');
                if (window.focus) { newwindow.focus(); }
            },
            positionPopup: function (marketId) {
                var url = "/Markets/Pos0?marketId=" + encodeURIComponent(marketId);
                var positionWindow = window.open(
                    url,
                    "Position " + marketId,
                    "height=320,width=240,titlebar=0,menubar=0,toolbar=0,location=0,status=0,scrollbars=1,resizable=1");

                if (window.focus && positionWindow) {
                    positionWindow.focus();
                }
            },
            IsLineMarket: function (marketId) {
                if (this.market.marketId === marketId) {
                    if (this.market.hasOwnProperty("bettingType")) {
                        Order.IsLine = this.market.bettingType === 'LINE';
                    } else {
                        Order.isLine = this.market.description.bettingType === "LINE";
                    }
                } else {
                    var market = _.find(this.catalogues, function (catalogue) {
                        return catalogue.marketId === marketId;
                    });

                    if (market === undefined) {
                        Order.isLine = false;
                    } else {
                        if (market.hasOwnProperty("bettingType")) {
                            Order.isLine = market.bettingType === "LINE";
                        } else {
                            Order.isLine = market.description.bettingType === "LINE";
                        }
                    }
                }
                OrderVue.isLine = Order.isLine;
                return Order.isLine;
            },
            HasFancyMarket: function () {
                var m = _.find(this.catalogues, function (item) {
                    return item.marketType !== "LOCAL_FANCY" && item.bettingType === "LINE"
                });
                return m !== undefined;
            },
            IsFancyMarket: function (marketId) {
                var market = _.find(this.catalogues, function (catalogue) {
                    return catalogue.marketId === marketId;
                });
                if (market === undefined) {
                   return false;
                }
                if (market.marketId === marketId) {
                    if (market.marketType !== "LOCAL_FANCY" && market.bettingType === "LINE")
                    {
                            return true;
                        } else {
                            return false;
                    }
                } 
            },
            HasFancy2Market: function () {
                var m = _.find(this.catalogues, function (item) {
                    return item.marketType == "LOCAL_FANCY" && item.bettingType === "LINE"
                });
                return m !== undefined;
            },
            IsFancy2Market: function (marketId) {
                var market = _.find(this.catalogues, function (catalogue) {
                    return catalogue.marketId === marketId;
                });
                if (market === undefined) {
                    return false;
                }
                if (market.marketId === marketId) {
                    if (market.marketType === "LOCAL_FANCY" && market.bettingType === "LINE") {
                        return true;
                    } else {
                        return false;
                    }
                }
            },
            IsBookmakerMarket: function (marketId) {
                var market = _.find(this.catalogues, function (catalogue) {
                    return catalogue.marketId === marketId;
                });
                if (market === undefined || market.marketName == null) {
                    return false;
                } else if (market.marketName == this.bookmakerMarketName || market.marketName == "BOOKMAKER" || market.marketName.toLowerCase().includes("bookmaker")) {
                    return true;
                }
                return false;
            },
            PlayCommentry: function (commentryText) {
                if (this.IsVoice) {
                    CommentryPlayer.Play(commentryText);
                }
            },
            ShowFullPosition: function (MarketId) {
                fullPath = "/" + getUserDirectory() + "/FullPosition?MarketId=" + MarketId;

                newwindow = window.open(fullPath, "MarketFullPos", 'height=500,width=500,titlebar=0,menubar=0');
                if (window.focus) { newwindow.focus(); }
                return false;
            }
        }
    });
}

var MarketId;
var EventId;
var Order = { isLine: false };
var CurrentMarket;
var BookIntervalId;
var OrderIntervalId;
var LastNavId = 0;
var Channel;

function GetSports(id, type) {
    LastNavId = id;
    var qs = svc_prefix + 'Navigation?id=' + id + '&type=' + type;
    $.getJSON(qs, function (result) {
        var FinalNav = menuTrail.concat(result);
        FinalNav.unshift({ id: 0, name: "Refresh", type: 0 });
        RenderSports(FinalNav);
        return false;
    });
}

function RenderSports(Items) {
    LastClicked = menuTrail[menuTrail.length - 1];
    LastNavItems = Items;
    Items = Items.slice(0, 50);
    $("#LeftNavigation").html('');
    var html;
    if (document.location.href.includes("Customer")) {
        html = '<li class="nav-item"><a class="nav-link-small {class2} {class3}" href="#!{HREF}"> {TEXT}</a></li>';
    }
    else {
        html = '<li class="nav-item"><a class="nav-link-small {class2} {class3}" href="#!{HREF}"> {TEXT}</a></li>';
    }

    Items.forEach(function (Item) {
        if (LastNavId === "7" && Item.type === 2) return;
        var class2 = Item.id === 0 ? 'icon-refresh' : '';
        var handler = Item.type === 5 ? Item.id : Item.id + '/' + Item.type;
        var navHtml = html.replace('{HREF}', handler).replace('{TEXT}', Item.name).replace('{class2}', class2);
        if (LastClicked !== undefined) {
            var class3 = Item.id === LastClicked.id ? 'active' : '';
            navHtml = navHtml.replace('{class3}', class3);
        }
        $("#LeftNavigation").append(navHtml);
    });
}
var MarketEVID;

function GetMarket(marketId) {
    OrderVue.MarketChangeStarted();

    marketStore.state.marketId = marketId;
    if (MarketVue === undefined) {
        var marketPage = getUserDirectory();
        if (marketPage !== 'Markets') {
            marketPage += '/Market';
        }
        document.location.href = '/' + marketPage + '/#!' + marketId;
        return;
    }
    ResetWinner();
    MarketVue.catalogues = [];
    MarketId = marketId;

    let qs = svc_prefix + 'Markets/Catalog2/?id=' + marketId;
    $.getJSON(qs, function (result) {
        marketStore.state.eventId = result.eventId;
        marketStore.state.marketType = result.marketType;
        let timeCode = "";

        if (result.eventTypeId == 7 || result.eventTypeId == 4339) {
            timeCode = moment(result.marketStartTimeUtc).format("HHmm");
        }

        OrderVue.MarketChanged(marketId, result.eventId, timeCode);

        RenderMarket(result);
    });
}

function RenderMarket(Market) {

    if (Market.eventType == "Race") {
        var date = moment(Market.marketStartTimeUtc).format('h:mm a') + " " + Market.raceName;
        Market.eventName = date;
    }
    CurrentMarket = Market;
    Market.runners = Market.runners.map(function (runner) {
        runner.price1 = '';
        runner.size1 = '';
        runner.price2 = '';
        runner.size2 = '';
        runner.price3 = '';
        runner.size3 = '';
        runner.lay1 = '';
        runner.ls1 = '';
        runner.lay2 = '';
        runner.ls2 = '';
        runner.lay3 = '';
        runner.ls3 = '';
        runner.ifWin = '';
        runner.ifLose = '';
        return runner;
    });

    Market.runners[Market.runners.length - 1].IsLast = true;
    document.title = Market.eventName + " - " + Market.marketName;
    MarketVue.startTime = Market.marketStartTimeUtc;
    MarketVue.market = Market;
    MarketVue.IsLoaded = true;

    MarketEVID = Market.eventId;
    if (Market.eventTypeId == 7 || Market.eventTypeId == 4339) {
        $("#livebackbtn").hide();
        $("#LIVEDIV").hide();
        //$("#tvbackbtn").width('100%');
        GetChannelData(MarketEVID);
    } else {
        //$("#tvbackbtn").width('50%');
        $("#livebackbtn").show();
        LiveScorecard(MarketId);
    }
}

var LiveScore = "";

function LiveScorecard(marketId) {
    LiveScore = score_url + marketId;
    var iframe = document.getElementById('livesc');
    if (iframe != null) {
        iframe.src = LiveScore;
        var element = document.getElementById("UnrealPlayer1_Video");
        if (element == null) {
            //$("#LIVEDIV").show();
        } else {
            GetChannelData(MarketEVID);
        }
    }
}

function GetChannelData(EVID) {
    var element = document.getElementById("UnrealPlayer1_Video");
    if (element != null) {
        element.parentNode.removeChild(element);
        streams.forEach(function (str) {
            if (str.player !== null) {
                str.player.Stop();
            }
            document.querySelector(str.container).style.display = 'none';
            document.querySelector(str.el).style.display = 'none';
            document.querySelector(str.unreal).style.display = 'none';
            document.querySelector(str.unreal).player = null;
        });
    }
    var qs = svc_prefix + 'Markets/GetChannel/?EVID=' + EVID;
    $.get(qs, function (result) {
        if (result == '') {
            if ($("#TVDIVIFRAME").is(":visible")) {
                document.getElementById('TVDIVIFRAME').innerHTML = "";
                $("#TVDIVIFRAME").hide();
            } else {
                var ad = video_url + MarketEVID;
                $("#TVDIVIFRAME").prepend("<iframe id='beiframe' src='" + ad+"'></iframe>");
                $("#TVDIVIFRAME").show();
            }
        } else {
            document.getElementById('TVDIVIFRAME').innerHTML = "";
            $("#TVDIVIFRAME").hide();
            $("#TVDIV").show();
            playChannel(result);
        }
    });
}

// highligh winner of current market
function MarkWinner(id) {
    $("#runner-" + id).addClass('winner');
}

// Before rendering new market, reset previous market winners
function ResetWinner() {
    $(".winner").removeClass('winner');
}

function ActSettle() {
    var qs = svc_prefix + 'Orders/settle';

    var MarketIds = [MarketId];

    $.ajax({
        type: "POST",
        url: qs,
        data: JSON.stringify(MarketIds),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (result) {
        },
        error: function () {

        }
    });
}

var MarketVue, OrderVue;

/*! WebEx.components.js */
Vue.component('market-locker', {
    props: [],
    data: function () {
        return {
            IsLoading: true,
            marketId: '',
            eventId: '',
            marketTitle: '',
            lockType: '',
            Users: [],
            AllLockActive: false
        }
    },
    template: `
        <div class="dropdown mr-2">
            <a class="btn btn-primary dropdown-toggle" href="#" role="button" id="dropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">Bet Lock</a>

            <div class="dropdown-menu" aria-labelledby="dropdownMenuLink" x-placement="bottom-start" style="position: absolute; will-change: transform; top: 0px; left: 0px; transform: translate3d(0px, 35px, 0px);">
                <a class="dropdown-item" v-on:click.prevent="showMarketLocker('Match Odds')" href="#">Match Odds</a>
                <a class="dropdown-item" v-on:click.prevent="showMarketLocker('Other Markets', true)" href="#">Other Markets</a>
            </div>

            <div class="modal fade" id="modalLocker" tabindex="-1" role="dialog" aria-labelledby="betSlipMobile" aria-hidden="true">
                <div class="modal-dialog modal-md" role="document">
                    <div class="modal-content">
                        <div class="modal-body" v-if="IsLoading">
                            <img src="/img/preloader.gif">
                        </div>
                        <div class="modal-body" v-else>
                            <h5>{{ marketTitle }} - Bet Locker</h5>
                            <div v-if="lockType === 'self'">
                                <div class="alert alert-danger" role="alert">
                                  Market locked by your dealer!
                                </div>
                            </div>
                            <div v-else>
                                <div class="form-check form-check-inline">
                                  <input class="form-check-input" type="radio" id="uAll" v-model="lockType" value="all">
                                  <label class="form-check-label" for="uAll">All Users</label>
                                </div>
                                <div class="form-check form-check-inline" v-show="AllLockActive">
                                  <input class="form-check-input" type="radio" id="unlock" v-model="lockType" value="unlock">
                                  <label class="form-check-label" for="unlock">Unlock All</label>
                                </div>
                                <div class="form-check form-check-inline">
                                  <input class="form-check-input" type="radio" id="uSel" v-model="lockType" value="sel">
                                  <label class="form-check-label" for="uSel">Selected Users</label>
                                </div>
                                <button class="btn btn-primary" type="button" v-on:click="UpdateLocks()">Save</button>
                                <button class="btn btn-danger" type="button" v-on:click="hideLocker()">Cancel</button>
                                <div v-show="lockType === 'sel'">
                                    <div class="form-check" v-for="User in Users">
                                      <input class="form-check-input" type="checkbox" v-model="User.isActive" value="1">
                                      <label class="form-check-label">
                                        {{ User.username }}
                                      </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    computed: {
        newLocks: function () {

            var self = this;

            var locks = [];

            if (this.lockType === 'all') {
                lockAll = {
                    marketId: self.marketId.toString(),
                    eventId: self.eventId.toString(),
                    userId: marketStore.state.userId,
                    managerId: marketStore.state.userId
                };
                locks.push(lockAll);
            } else if (this.lockType === 'sel') {
                var selUsers = _.filter(this.Users, function (User) {
                    return User.isActive;
                });

                locks = _.map(selUsers, function (User) {
                    return {
                        marketId: self.marketId.toString(),
                        eventId: self.eventId.toString(),
                        userId: User.id,
                        managerId: marketStore.state.userId
                    };
                });
            }
            return locks;
        }
    },
    methods: {
        showLocker: function () {
            $("#modalLocker").modal('show');
        },
        hideLocker: function () {
            $("#modalLocker").modal('hide');
        },
        showMarketLocker: function (title, IsEvent = false) {

            this.IsLoading = true;

            if (IsEvent) {
                this.eventId = marketStore.state.eventId;
                this.marketId = '';
            } else {
                this.eventId = '';
                this.marketId = marketStore.state.marketId;
            }

            this.marketTitle = title;

            this.showLocker();

            window.client.getUsers(this.handleUsers);
        },

        handleUsers: function (data) {

            this.Users = data;

            window.client.getMarketLocks(this.marketId, this.eventId, this.handleLocks);
        },
        handleLocks: function (data) {
            var self = this;

            this.IsLoading = false;

            var IsLockedForMe = _.find(data, function (lock) {
                return marketStore.state.userId === lock.userId && marketStore.state.userId !== lock.managerId;
            });

            if (IsLockedForMe) {
                this.lockType = "self";
                return;
            }

            var IsLockedForAll = _.find(data, function (lock) {
                return marketStore.state.userId === lock.userId && marketStore.state.userId === lock.managerId;
            });

            if (IsLockedForAll) {
                this.lockType = "all";
                this.AllLockActive = true;
                return;
            }

            this.lockType = "sel";

            _.each(self.Users, function (User) {
                var userLock = _.find(data, function (lock) {
                    return User.id === lock.userId;
                });

                if (userLock !== undefined) {
                    User.isActive = true;
                } else {
                    User.isActive = false;
                }
            });
        },
        UpdateLocks: function () {
            if (this.lockType === 'unlock' || this.newLocks.length === 0) {
                window.client.deleteMarketLocks(this.marketId.toString(), this.eventId.toString(), this.UpdateLockCompleted);
            } else {
                window.client.updateMarketLocks(this.newLocks, this.UpdateLockCompleted);
            }
        },
        UpdateLockCompleted: function (data) {
            $("#modalLocker").modal('hide');
            // this.hideLocker();
        }
    }
});

Vue.component('market-orders', {
    props: ['orders'],
    template: `
        <div>
            <div :id="order.orderId" 
                class="row" 
                v-for="order in orders" 
                v-bind:class="{ 'order-b': order.IsBack, 'order-l': order.IsLay }"
            >
                <div class="col-4">{{ order.rn }}</div>
                <div class="col-2 no-pad">{{ order.up }}</div>
                <div class="col-2 no-pad">{{ order.us | format }}</div>
                <div class="col-2 no-pad">{{ order.bn }}</div>
                <div class="col-2 no-pad">{{ order.mn }}</div>
            </div>
        </div>
    `
});

class WebApiClient {
    constructor() { }

    getUsers(callback) {
        $.ajax({
            url: '/api/Users?IsDirectChild=true',
            success: callback,
            dataType: 'json'
        });
    }

    getMarketLocks(marketId, eventId, callback) {
        $.ajax({
            url: '/api/marketlocker?marketId=' + marketId + '&eventId=' + eventId,
            success: callback,
            dataType: 'json'
        });
    }

    updateMarketLocks(locks, callback) {
        $.ajax({
            type: "POST",
            url: '/api/marketlocker',
            data: JSON.stringify(locks),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: callback,
            error: function (exception) { }
        });
    }

    deleteMarketLocks(marketId, eventId, callback) {
        $.ajax({
            type: "DELETE",
            url: '/api/marketlocker/0?marketId=' + marketId + '&eventId=' + eventId,
            dataType: "json",
            success: callback
        });
    }
}

var client = new WebApiClient();

if ($("#Pnl-Orders").length > 0) {
    OrderVue = new Vue({
        el: "#Pnl-Orders",
        mixins: [signalrMixin],
        data: {
            Matched: [],
            UnMatched: [],
            Active: false,
            isLine: false,
            activeEventId: null,
            activeMarketId: null,
            timeCode: null,
            isRenderNewOrders: false,

            // A queue to accumulate incoming orders
            orderQueue: [],
            batchTimerId: null,
            matchedOrdersCount: 0
        },
        created: function () {
            const self = this;

            self.signalRFlags.orders = typeof dealerSck != 'undefined' && dealerSck === 1;

            self.OrderIntervalId = setInterval(self.ListOrders, 3000);

            this.batchTimerId = setInterval(() => {
                this.processOrderQueue();
            }, 250);
        },
        watch: {

        },
        computed: {
            marketId: function () {
                return marketStore.state.marketId;
            }
        },
        methods: {
            MarketChangeStarted: function () {
                this.isRenderNewOrders = false;
                this.Matched = [];
                this.UnMatched = [];
            },
            MarketChanged: function (marketId, eventId, timeCode) {
                this.isRenderNewOrders = true;
                this.sToken = token;
                this.activeMarketId = marketId;
                this.activeEventId = eventId.toString();
                this.timeCode = timeCode;

                this.Connect();
            },
            ListOrders: function () {

                if (marketStore.state.eventId === null || marketStore.state.eventId === '')
                    return;

                const self = this;

                if (self.signalRFlags.orders && this.isSignalRConnected) return;

                clientEx.ListOrders(marketStore.state.eventId, marketStore.state.marketId, 50)
                    .then((data) => {
                        self.RenderOrdersPosition(data);
                    })
                    .catch((error) => {
                        console.log(error);
                    });
            },
            RenderOrdersPosition: function (result) {
                this.RenderOrders(this, result['vOrders']);
                window.MarketPL = result['pls'];
            },
            RenderOrders: function (self, Orders) {
                // matched 
                var MatchedNew = Orders.filter(function (order) {
                    return order.ms > 0;
                });

                var IsRenderMatched = MatchedNew.length !== self.Matched.length;
                if (self.Matched.length > 0 && MatchedNew.length > 0) {
                    IsRenderMatched = IsRenderMatched || self.Matched[0].id !== MatchedNew[0].id;
                }

                if (IsRenderMatched) {
                    // empty and refill
                    self.Matched = [];
                    MatchedNew.forEach(function (Order) {
                        Order.IsBack = Order.bs === "B";
                        Order.IsLay = Order.bs === "L";

                        self.Matched.push(Order);
                    });
                }

                // UnMatched
                var UnMatchNew = Orders.filter(function (order) {
                    return (order.us - order.ms) > 0;
                });

                self.UnMatched = [];
                UnMatchNew.forEach(function (Order) {
                    Order.IsBack = Order.bs === "B";
                    Order.IsLay = Order.bs === "L";

                    self.UnMatched.push(Order);
                });

                self.matchedOrdersCount = self.Matched.length;
            },
            ShowAllOrders: function () {

                var fullPath = "/Common/Orders?MarketId=" + marketStore.state.marketId + "&EventId=" + marketStore.state.eventId;

                newwindow = window.open(fullPath, "OrdersList", 'height=500,width=600,titlebar=0,menubar=0');
                if (window.focus) { newwindow.focus(); }
                return false;
            },
            ShowAdminOrders: function () {
                var fullPath = "/System/BookOrders?EventId=" + marketStore.state.eventId;
                newwindow = window.open(fullPath, "Full Orders For Admin", 'height=800,width=1600,titlebar=0,menubar=0');
                if (window.focus) { newwindow.focus(); }
                return false;
            },
            ShowManagerOrders: function () {
                var fullPath = "/Manage/BookOrders?EventId=" + marketStore.state.eventId;
                newwindow = window.open(fullPath, "Full Orders For Manager", 'height=800,width=1500,titlebar=0,menubar=0');
                if (window.focus) { newwindow.focus(); }
                return false;
            },
            ShowFullPosition: function (MarketId) {
                fullPath = "/" + getUserDirectory() + "/FullPosition?MarketId=" + MarketId;

                newwindow = window.open(fullPath, "MarketFullPos", 'height=500,width=1200,titlebar=0,menubar=0');
                if (window.focus) { newwindow.focus(); }
                return false;
            },
            positionPopup: function (marketId) {
                var url = "/Markets/Pos0?marketId=" + encodeURIComponent(marketId);
                var positionWindow = window.open(
                    url,
                    "Position " + marketId,
                    "height=420,width=360,titlebar=0,menubar=0,toolbar=0,location=0,status=0,scrollbars=1,resizable=1");

                if (window.focus && positionWindow) {
                    positionWindow.focus();
                }
            },
            RenderOrder(order) {
                this.orderQueue.push(order);

                ++ this.matchedOrdersCount;
            },
            processOrderQueue() {
                // If there's nothing in the queue, skip
                if (!this.orderQueue.length) return;
          
                // Copy and clear the queue
                const queueCopy = this.orderQueue.splice(0, this.orderQueue.length);
          
                // Now process each order
                for (const order of queueCopy) {
                  this.RenderQueuedOrder(order);
                }
          
                if (this.Matched.length > 100) {
                  this.Matched.splice(100);
                }
            },
            RenderQueuedOrder: function (order) {
                let self = this;

                if (!this.ShouldRender(order)) {
                    return;
                }

                order.IsBack = order.bs === "B";
                order.IsLay = order.bs === "L";

                let UnmatchedIndex = _.findIndex(self.UnMatched, function (Order) {
                    return Order.id === order.id;
                });
                if (UnmatchedIndex >= 0) {
                    self.UnMatched.splice(UnmatchedIndex, 1);
                }

                let matchedIndex = _.findIndex(self.Matched, function (Order) {
                    return Order.id === order.id;
                });

                if (matchedIndex >= 0) {
                    self.Matched.splice(matchedIndex, 1);
                }

                if (order.ms > 0) {
                    self.Matched.unshift(order);
                }

                if (order.us > 0) {
                    self.UnMatched.unshift(order);
                }
            },
            ShouldRender: function (order) {
                if (order == null || order == undefined || order.id == null || order.id == undefined) {
                    return false;
                }

                if (order.hasOwnProperty('eid') && order.eid == this.activeEventId) {
                    return true;
                }

                return false;

                // return order.mid === marketId || self.SubMarketIds.includes(order.mid);
            },
            RenderAllPositions: function (cpl) {
                cpl.profitlosses.forEach(function (profitloss) {
                    let AllreadyFound = _.find(window.MarketPL, function (available) {
                        return profitloss.selectionId == available.selectionId && profitloss.marketId == available.marketId;
                    });
                    if (AllreadyFound !== null && AllreadyFound !== undefined) {
                        AllreadyFound.ifLose = profitloss.ifLose;
                        AllreadyFound.ifWin = profitloss.ifWin;
                    } else {
                        let toinsert = { marketId: profitloss.marketId, selectionId: profitloss.selectionId, ifWin: profitloss.ifWin, ifLose: profitloss.ifLose };
                        window.MarketPL.push(toinsert);
                    }
                });
            }
        }
    });
}

function getUserDirectory() {
    var userDir = 'Markets';
    var PathName = document.location.pathname.split('/');
    if (PathName[1].length > 0) {
        userDir = PathName[1];
    }
    return userDir;
}

function PlayVid(ch) {
    var url = 'https://livemediasystem.com/bf/c.php?ch=c' + ch + '&user=uuu.001';
    document.getElementById('vidFrame').src = url;
}

function UpdatePriceCell(oldVal, newVal, index, selectionId, bgcolor) {
    if (oldVal === newVal) return newVal;
    bg = oldVal > newVal ? plusFlash : minusFlash;
    var el = "#" + index + "-" + selectionId;
    $(el).flash(bgcolor, bg, 300);
    return newVal;
}

function ShowFancyPosition() {
    $(".dialog-fancy").dialog({
        autoOpen: true,
        height: 400,
        width: 250,
        modal: false
    });
}