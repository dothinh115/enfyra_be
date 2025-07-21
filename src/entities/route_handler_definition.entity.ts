import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Method_definition } from './method_definition.entity';
import { Route_definition } from './route_definition.entity';

@Entity('route_handler_definition')
@Unique(['method', 'route'])
export class Route_handler_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "text", nullable: true })
    logic: string;
    @Index()
    @ManyToOne('Method_definition', (rel: any) => rel.handlers, { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    method: any;
    @Index()
    @ManyToOne('Route_definition', (rel: any) => rel.handlers, { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
