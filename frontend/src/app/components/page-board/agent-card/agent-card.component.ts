import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Side } from '../../../../../../server/src/model/agent_side';

@Component({
    selector: 'app-agent-card',
    templateUrl: './agent-card.component.html',
    styleUrls: ['./agent-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentCardComponent {
    @Input() name = '';
    @Input() side = Side.UNKNOWN;
    @Input() uncovered = false;
    @Input() uncoveringInProgress: number | boolean = false;
    @Input() fontSize = 0;

    BLUE = Side.BLUE;
    RED = Side.RED;
    NEUTRAL = Side.NEUTRAL;
    BLACK = Side.ASSASSIN;
    UNKNOWN = Side.UNKNOWN;

    get cardAriaLabel(): string {
        const uncoveredSuffix = this.uncovered ? ', раскрыт' : '';
        switch (this.side) {
            case Side.BLUE:    return `${this.name}, агент синих${uncoveredSuffix}`;
            case Side.RED:     return `${this.name}, агент красных${uncoveredSuffix}`;
            case Side.ASSASSIN: return `${this.name}, убийца${uncoveredSuffix}`;
            case Side.NEUTRAL: return `${this.name}, нейтральный${uncoveredSuffix}`;
            default:           return this.name;
        }
    }

    onKeyActivate(event: KeyboardEvent): void {
        if (event.key === ' ') {
            event.preventDefault(); // prevent page scroll on Space
        }
        (event.currentTarget as HTMLElement).click();
    }
}
